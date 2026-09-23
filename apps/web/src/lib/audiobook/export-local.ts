import "server-only";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { encodeExportMetadata, exportFormatSchema, exportMetadataSchema, exportProfile, EXPORT_SAMPLE_RATE, type MeasuredExportChapter } from "./export-contract";

const inputSchema = z.object({
  editionId: z.string().min(1), format: exportFormatSchema, metadata: exportMetadataSchema,
  expectedChapterIds: z.array(z.string().min(1)).min(1).max(20),
  chapters: z.array(z.object({ id: z.string().min(1), title: z.string().min(1).max(200), filePath: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict()).min(1).max(20),
}).strict();
const tags = z.record(z.string(), z.string());
const probeSchema = z.object({ streams: z.array(z.object({ codec_type: z.string(), codec_name: z.string().optional(), sample_rate: z.string().optional(), bit_rate: z.string().optional() })), chapters: z.array(z.object({ start_time: z.string(), end_time: z.string(), tags })).default([]), format: z.object({ duration: z.string(), tags }) });
const MAX_INPUT_BYTES = 20 * 1024 * 1024;
const MAX_PCM_BYTES = 32 * 1024 * 1024;
type Options = { sourceRoot: string; ffmpeg?: string; ffprobe?: string; signal?: AbortSignal; maxOutputBytes?: number };

/** No shell, no stdin, bounded diagnostics/output, and kill before settling cancellation. */
export function runAudioTool(binary: string, args: string[], signal?: AbortSignal): Promise<string> {
  if (signal?.aborted) return Promise.reject(new Error("Audio export was cancelled."));
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"], shell: false });
    let output = "", stderr = "", failure: Error | null = null;
    const abort = () => { failure = new Error("Audio export was cancelled."); child.kill("SIGKILL"); };
    const timer = setTimeout(() => { failure = new Error("The local audio tool timed out."); child.kill("SIGKILL"); }, 30000);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString(); if (output.length > 1_000_000) { failure = new Error("Audio inspection exceeded its output limit."); child.kill("SIGKILL"); } });
    child.stderr.on("data", (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-4096); });
    child.on("error", () => { failure = new Error("Local audio tools are unavailable."); });
    child.on("close", (code) => { clearTimeout(timer); signal?.removeEventListener("abort", abort); if (failure) reject(failure); else if (code !== 0) reject(new Error(`The local audio tool failed${stderr ? " while processing the file" : ""}.`)); else resolve(output); });
  });
}
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const baseArgs = ["-hide_banner", "-loglevel", "error", "-nostdin", "-y"];

/** Disconnected local encoder. Its only app caller is the synthetic development endpoint. */
export async function exportLocalAudio(value: unknown, options: Options) {
  const input = inputSchema.parse(value);
  if (new Set(input.expectedChapterIds).size !== input.expectedChapterIds.length || JSON.stringify(input.chapters.map((chapter) => chapter.id)) !== JSON.stringify(input.expectedChapterIds)) throw new Error("Every chapter must be present in the correct order before export.");
  if (options.signal?.aborted) throw new Error("Audio export was cancelled.");
  const root = await fs.realpath(options.sourceRoot);
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "verkli-export-"));
  const ffmpeg = options.ffmpeg || "ffmpeg", ffprobe = options.ffprobe || "ffprobe";
  const measured: MeasuredExportChapter[] = [];
  const pcm: Buffer[] = [];
  let samples = 0;
  try {
    for (const [index, chapter] of input.chapters.entries()) {
      const source = await fs.realpath(chapter.filePath);
      if (!source.startsWith(root + path.sep)) throw new Error("Audio source is outside the export workspace.");
      const stat = await fs.stat(source);
      if (!stat.isFile() || stat.size > MAX_INPUT_BYTES) throw new Error("Audio source exceeds the local fixture limit.");
      const bytes = await fs.readFile(source);
      if (hash(bytes) !== chapter.sha256) throw new Error("An audio source changed before export. Reload the source edition.");
      const frozen = path.join(temporary, `source-${index}.audio`), normalized = path.join(temporary, `chapter-${index}.pcm`);
      await fs.writeFile(frozen, bytes);
      await runAudioTool(ffmpeg, [...baseArgs, "-protocol_whitelist", "file,pipe", "-format_whitelist", "wav,mp3,mov", "-i", frozen, "-map", "0:a:0", "-vn", "-sn", "-dn", "-threads", "1", "-ar", String(EXPORT_SAMPLE_RATE), "-ac", "1", "-f", "s16le", "-fs", String(MAX_PCM_BYTES + 2), normalized], options.signal);
      const data = await fs.readFile(normalized);
      if (!data.length || data.length % 2 || data.length > MAX_PCM_BYTES || samples * 2 + data.length > MAX_PCM_BYTES) throw new Error("Decoded audio exceeds the local fixture limit or is empty.");
      const endSample = samples + data.length / 2;
      measured.push({ id: chapter.id, title: chapter.title, startSample: samples, endSample }); samples = endSample; pcm.push(data);
    }
    const combined = path.join(temporary, "book.pcm"), metadataPath = path.join(temporary, "metadata.txt");
    await fs.writeFile(combined, Buffer.concat(pcm));
    await fs.writeFile(metadataPath, encodeExportMetadata(input.metadata, measured));
    const profile = exportProfile(input.format), output = path.join(temporary, `book.${profile.extension}`);
    const codecArgs = input.format === "m4b" ? ["-c:a", "aac", "-b:a", "128k", "-f", "mp4", "-movflags", "+faststart+use_metadata_tags", "-map_chapters", "1"] : ["-c:a", "libmp3lame", "-b:a", `${profile.bitrate / 1000}k`, "-f", "mp3", "-id3v2_version", "3", "-map_chapters", "-1"];
    await runAudioTool(ffmpeg, [...baseArgs, "-protocol_whitelist", "file,pipe", "-f", "s16le", "-ar", String(EXPORT_SAMPLE_RATE), "-ac", "1", "-i", combined, "-protocol_whitelist", "file,pipe", "-f", "ffmetadata", "-i", metadataPath, "-map", "0:a:0", "-map_metadata", "1", "-threads", "1", ...codecArgs, output], options.signal);
    const audio = await fs.readFile(output);
    if (!audio.length || audio.length > (options.maxOutputBytes ?? 50 * 1024 * 1024)) throw new Error("The export exceeds the configured size limit. No download was published.");
    const probe = probeSchema.parse(JSON.parse(await runAudioTool(ffprobe, ["-v", "error", "-protocol_whitelist", "file,pipe", "-show_streams", "-show_chapters", "-show_format", "-of", "json", output], options.signal)));
    const streams = probe.streams.filter((stream) => stream.codec_type === "audio");
    if (streams.length !== 1 || streams[0].codec_name !== profile.codec || streams[0].sample_rate !== String(EXPORT_SAMPLE_RATE) || probe.streams.some((stream) => stream.codec_type === "video")) throw new Error("The exported audio stream could not be verified.");
    for (const [key, expected] of Object.entries(input.metadata)) if (probe.format.tags[key] !== expected) throw new Error(`The exported ${key} metadata could not be verified.`);
    if (input.format === "m4b") {
      if (probe.chapters.length !== measured.length) throw new Error("The exported chapter count could not be verified.");
      measured.forEach((chapter, index) => {
        const actual = probe.chapters[index];
        if (actual.tags.title !== chapter.title || Math.abs(Number(actual.start_time) - chapter.startSample / EXPORT_SAMPLE_RATE) > 0.0011 || Math.abs(Number(actual.end_time) - chapter.endSample / EXPORT_SAMPLE_RATE) > 0.0011) throw new Error("The exported chapter boundaries could not be verified.");
      });
    } else if (Number(streams[0].bit_rate) !== profile.bitrate) throw new Error("The exported MP3 bitrate could not be verified.");
    const decoded = path.join(temporary, "verification.pcm");
    await runAudioTool(ffmpeg, [...baseArgs, "-protocol_whitelist", "file,pipe", "-i", output, "-map", "0:a:0", "-threads", "1", "-ar", String(EXPORT_SAMPLE_RATE), "-ac", "1", "-f", "s16le", "-fs", String(MAX_PCM_BYTES + 2), decoded], options.signal);
    const verifiedPcm = await fs.readFile(decoded);
    const frameSamples = input.format === "m4b" ? 1024 : 1152;
    if (Math.abs(verifiedPcm.length / 2 - samples) > frameSamples || !Number.isFinite(Number(probe.format.duration)) || Math.abs(Number(probe.format.duration) - samples / EXPORT_SAMPLE_RATE) > frameSamples / EXPORT_SAMPLE_RATE * 2) throw new Error("The exported duration could not be verified.");
    return { audio, format: input.format, contentType: profile.contentType, extension: profile.extension, durationSeconds: samples / EXPORT_SAMPLE_RATE, chapters: measured, sha256: hash(audio), probe, verifiedPcm };
  } finally { await fs.rm(temporary, { recursive: true, force: true }); }
}
