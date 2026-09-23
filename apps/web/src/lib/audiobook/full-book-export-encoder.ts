import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { constants, createReadStream, createWriteStream, promises as fs } from "node:fs";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { z } from "zod";
import { encodeExportMetadata, exportFormatSchema, exportMetadataSchema, exportProfile, EXPORT_SAMPLE_RATE, type MeasuredExportChapter } from "./export-contract";

export const FULL_BOOK_EXPORT_LIMITS = Object.freeze({
  maxSourceBytes: 128 * 1024 ** 2,
  maxTotalSourceBytes: 2 * 1024 ** 3,
  maxPcmBytes: 8 * 1024 ** 3,
  maxOutputBytes: 512 * 1024 ** 2,
  timeoutMs: 60 * 60 * 1000,
});
export type FullBookExportOptions = {
  sourceRoot: string; outputRoot: string; signal?: AbortSignal; ffmpeg?: string; ffprobe?: string;
  limits?: Partial<typeof FULL_BOOK_EXPORT_LIMITS>;
};
const inputSchema = z.object({
  editionId: z.string().min(1), format: exportFormatSchema, metadata: exportMetadataSchema,
  expectedChapterIds: z.array(z.string().min(1)).min(1).max(500),
  chapters: z.array(z.object({ id: z.string().min(1), title: z.string().min(1).max(200).regex(/^[^\r\n\0]+$/), filePath: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict()).min(1).max(500),
}).strict();
const tags = z.record(z.string(), z.string());
const probeSchema = z.object({ streams: z.array(z.object({ codec_type: z.string(), codec_name: z.string().optional(), sample_rate: z.string().optional(), bit_rate: z.string().optional() })), chapters: z.array(z.object({ start_time: z.string(), end_time: z.string(), tags })).default([]), format: z.object({ duration: z.string(), tags }) });
const baseArgs = ["-hide_banner", "-loglevel", "error", "-nostdin", "-y"];
function cancelled(signal: AbortSignal) {
  if (signal.aborted) throw signal.reason instanceof Error ? signal.reason : new Error("Full-book audio export was cancelled.");
}
function byteLimit(maximum: number, message: string, onChunk?: (chunk: Buffer) => void) {
  let size = 0;
  return new Transform({ transform(chunk: Buffer, _encoding, callback) {
    size += chunk.length;
    if (size > maximum) { callback(new Error(message)); return; }
    onChunk?.(chunk); callback(null, chunk);
  } });
}

/** Processes settle only after close, including cancellation and stream/size failures. */
async function runTool(binary: string, args: string[], signal: AbortSignal, destination?: { filePath: string; maxBytes: number; append?: boolean }) {
  cancelled(signal);
  const child = spawn(binary, args, { shell: false, stdio: ["ignore", "pipe", "pipe"] });
  let output = "", outputBytes = 0, stderr = "", failure: Error | undefined;
  const fail = (error: Error) => { failure ??= error; child.kill("SIGKILL"); };
  const abort = () => fail(signal.reason instanceof Error ? signal.reason : new Error("Full-book audio export was cancelled."));
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  child.stderr.on("data", (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-4096); });
  child.on("error", () => fail(new Error("Full-book audio tools are unavailable.")));
  const closed = new Promise<number | null>((resolve) => child.once("close", resolve));
  let written: Promise<void> = Promise.resolve();
  if (destination) {
    written = pipeline(child.stdout, byteLimit(destination.maxBytes, "Decoded audio exceeds the configured PCM size limit."), createWriteStream(destination.filePath, { flags: destination.append ? "a" : "wx", mode: 0o600 }), { signal }).catch((error: Error) => { fail(error); });
  } else {
    child.stdout.on("data", (chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes > 1_000_000) fail(new Error("Audio inspection exceeded its output limit."));
      else output += chunk.toString();
    });
  }
  const [code] = await Promise.all([closed, written]);
  signal.removeEventListener("abort", abort);
  cancelled(signal);
  if (failure) throw failure;
  if (code !== 0) throw new Error(`Full-book audio tool failed${stderr ? " while processing audio" : ""}.`);
  return output;
}

/** Disk-backed encoder. Caller owns cleanup() after consuming the verified output file. */
export async function encodeFullBookAudio(value: unknown, options: FullBookExportOptions) {
  const input = inputSchema.parse(value);
  if (new Set(input.expectedChapterIds).size !== input.expectedChapterIds.length || JSON.stringify(input.chapters.map((chapter) => chapter.id)) !== JSON.stringify(input.expectedChapterIds)) throw new Error("Every chapter must be present in the correct order before export.");
  const limits = { ...FULL_BOOK_EXPORT_LIMITS, ...options.limits };
  if (Object.values(limits).some((limit) => !Number.isSafeInteger(limit) || limit <= 0) || limits.timeoutMs > 2_147_483_647 || limits.maxPcmBytes > Number.MAX_SAFE_INTEGER - 4096) throw new Error("Full-book export limits must be finite positive safe integers.");
  const controller = new AbortController();
  const abort = () => controller.abort(new Error("Full-book audio export was cancelled."));
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) abort();
  const timer = setTimeout(() => controller.abort(new Error("Full-book audio export timed out.")), limits.timeoutMs);
  const signal = controller.signal;
  let resultDirectory: string | undefined;
  let keepResult = false;
  try {
    cancelled(signal);
    const root = await fs.realpath(options.sourceRoot);
    await fs.mkdir(options.outputRoot, { recursive: true });
    const outputRoot = await fs.realpath(options.outputRoot);
    resultDirectory = await fs.mkdtemp(path.join(outputRoot, "verkli-full-book-"));
    const ownedDirectory = resultDirectory;
    const temporary = path.join(ownedDirectory, "work"); await fs.mkdir(temporary, { mode: 0o700 });
    const combined = path.join(temporary, "book.pcm");
    await fs.writeFile(combined, "", { mode: 0o600, flag: "wx" });
    const ffmpeg = options.ffmpeg || "ffmpeg", ffprobe = options.ffprobe || "ffprobe";
    const measured: MeasuredExportChapter[] = [];
    let samples = 0, sourceBytes = 0;
    for (const [index, chapter] of input.chapters.entries()) {
      cancelled(signal);
      const source = await fs.realpath(chapter.filePath);
      if (!source.startsWith(root + path.sep)) throw new Error("Audio source is outside the export workspace.");
      const sourceStat = await fs.stat(source);
      if (!sourceStat.isFile()) throw new Error("Audio source must be a regular file.");
      if (!sourceStat.size || sourceStat.size > limits.maxSourceBytes || sourceStat.size + sourceBytes > limits.maxTotalSourceBytes) throw new Error("Audio source exceeds the configured source size limit.");
      const handle = await fs.open(source, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      const frozen = path.join(temporary, `source-${index}.audio`);
      try {
        const opened = await handle.stat();
        if (!opened.isFile() || opened.dev !== sourceStat.dev || opened.ino !== sourceStat.ino || await fs.realpath(chapter.filePath) !== source) throw new Error("An audio source changed before export. Reload the source edition.");
        const hash = createHash("sha256");
        await pipeline(handle.createReadStream({ autoClose: false }), byteLimit(Math.min(limits.maxSourceBytes, limits.maxTotalSourceBytes - sourceBytes), "Audio source exceeds the configured source size limit.", (chunk) => { hash.update(chunk); sourceBytes += chunk.length; }), createWriteStream(frozen, { flags: "wx", mode: 0o600 }), { signal });
        if (hash.digest("hex") !== chapter.sha256) throw new Error("An audio source changed before export. Reload the source edition.");
      } finally { await handle.close(); }
      const remaining = limits.maxPcmBytes - samples * 2;
      if (remaining <= 0) throw new Error("Decoded audio exceeds the configured PCM size limit.");
      await runTool(ffmpeg, [...baseArgs, "-protocol_whitelist", "file,pipe", "-format_whitelist", "wav,mp3,mov", "-i", frozen, "-map", "0:a:0", "-vn", "-sn", "-dn", "-threads", "1", "-ar", String(EXPORT_SAMPLE_RATE), "-ac", "1", "-f", "s16le", "-fs", String(remaining + 2), "pipe:1"], signal, { filePath: combined, maxBytes: remaining, append: true });
      const pcmBytes = (await fs.stat(combined)).size - samples * 2;
      if (!pcmBytes || pcmBytes % 2) throw new Error("Decoded audio is empty or has an invalid sample length.");
      const endSample = samples + pcmBytes / 2;
      measured.push({ id: chapter.id, title: chapter.title, startSample: samples, endSample }); samples = endSample;
      await fs.unlink(frozen);
    }
    const metadataPath = path.join(temporary, "metadata.txt");
    await fs.writeFile(metadataPath, encodeExportMetadata(input.metadata, measured), { mode: 0o600 });
    const profile = exportProfile(input.format), output = path.join(ownedDirectory, `book.${profile.extension}`);
    const codecArgs = input.format === "m4b" ? ["-c:a", "aac", "-b:a", "128k", "-f", "mp4", "-movflags", "+faststart+use_metadata_tags", "-map_chapters", "1"] : ["-c:a", "libmp3lame", "-b:a", `${profile.bitrate / 1000}k`, "-f", "mp3", "-id3v2_version", "3", "-map_chapters", "-1"];
    await runTool(ffmpeg, [...baseArgs, "-protocol_whitelist", "file,pipe", "-f", "s16le", "-ar", String(EXPORT_SAMPLE_RATE), "-ac", "1", "-i", combined, "-protocol_whitelist", "file,pipe", "-f", "ffmetadata", "-i", metadataPath, "-map", "0:a:0", "-map_metadata", "1", "-threads", "1", ...codecArgs, "-fs", String(limits.maxOutputBytes + 1), output], signal);
    const byteLength = (await fs.stat(output)).size;
    if (!byteLength || byteLength > limits.maxOutputBytes) throw new Error("The export exceeds the configured output size limit. No download was published.");
    const probe = probeSchema.parse(JSON.parse(await runTool(ffprobe, ["-v", "error", "-protocol_whitelist", "file,pipe", "-show_streams", "-show_chapters", "-show_format", "-of", "json", output], signal)));
    const streams = probe.streams.filter((stream) => stream.codec_type === "audio");
    if (streams.length !== 1 || streams[0].codec_name !== profile.codec || streams[0].sample_rate !== String(EXPORT_SAMPLE_RATE) || probe.streams.some((stream) => stream.codec_type === "video")) throw new Error("The exported audio stream could not be verified.");
    for (const [key, expected] of Object.entries(input.metadata)) if (probe.format.tags[key] !== expected) throw new Error(`The exported ${key} metadata could not be verified.`);
    if (input.format === "m4b") {
      if (probe.chapters.length !== measured.length) throw new Error("The exported chapter count could not be verified.");
      measured.forEach((chapter, index) => {
        const actual = probe.chapters[index], start = Number(actual.start_time), end = Number(actual.end_time);
        if (!Number.isFinite(start) || !Number.isFinite(end) || actual.tags.title !== chapter.title || Math.abs(start - chapter.startSample / EXPORT_SAMPLE_RATE) > 0.0011 || Math.abs(end - chapter.endSample / EXPORT_SAMPLE_RATE) > 0.0011) throw new Error("The exported chapter boundaries could not be verified.");
      });
    } else if (Number(streams[0].bit_rate) !== profile.bitrate) throw new Error("The exported MP3 bitrate could not be verified.");
    await fs.unlink(combined);
    const decoded = path.join(temporary, "verification.pcm"), frameSamples = input.format === "m4b" ? 1024 : 1152;
    const verificationLimit = samples * 2 + frameSamples * 2;
    await runTool(ffmpeg, [...baseArgs, "-protocol_whitelist", "file,pipe", "-i", output, "-map", "0:a:0", "-threads", "1", "-ar", String(EXPORT_SAMPLE_RATE), "-ac", "1", "-f", "s16le", "-fs", String(verificationLimit + 2), "pipe:1"], signal, { filePath: decoded, maxBytes: verificationLimit });
    const decodedBytes = (await fs.stat(decoded)).size;
    if (!decodedBytes || decodedBytes % 2 || Math.abs(decodedBytes / 2 - samples) > frameSamples || !Number.isFinite(Number(probe.format.duration)) || Math.abs(Number(probe.format.duration) - samples / EXPORT_SAMPLE_RATE) > frameSamples / EXPORT_SAMPLE_RATE * 2) throw new Error("The exported duration could not be verified.");
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(output, { signal })) { cancelled(signal); hash.update(chunk); }
    await fs.rm(temporary, { recursive: true, force: true });
    cancelled(signal);
    keepResult = true;
    return { filePath: output, byteLength, sha256: hash.digest("hex"), format: input.format, contentType: profile.contentType, extension: profile.extension, durationSeconds: samples / EXPORT_SAMPLE_RATE, chapters: measured, probe, cleanup: () => fs.rm(ownedDirectory, { recursive: true, force: true }) };
  } catch (error) {
    cancelled(signal);
    throw error;
  } finally {
    clearTimeout(timer); options.signal?.removeEventListener("abort", abort);
    if (resultDirectory && !keepResult) await fs.rm(resultDirectory, { recursive: true, force: true });
  }
}
