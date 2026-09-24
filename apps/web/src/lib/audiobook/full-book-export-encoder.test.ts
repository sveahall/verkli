import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { encodeFullBookAudio, FULL_BOOK_EXPORT_LIMITS } from "./full-book-export-encoder";
import { runAudioTool } from "./export-local";

async function fixture() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "verkli-full-book-test-"));
  const sourceRoot = path.join(directory, "source"), outputRoot = path.join(directory, "output");
  await fs.mkdir(sourceRoot); await fs.mkdir(outputRoot);
  const filePath = path.join(sourceRoot, "chapter.wav");
  await fs.writeFile(filePath, "synthetic source");
  const chapter = { id: "one", title: "One", filePath, sha256: createHash("sha256").update("synthetic source").digest("hex") };
  const input = { editionId: "edition", format: "m4b", metadata: { title: "Full book", author: "Author", narrator: "Tones", language: "swe" }, expectedChapterIds: ["one"], chapters: [chapter] };
  return { directory, sourceRoot, outputRoot, input, cleanup: () => fs.rm(directory, { recursive: true, force: true }) };
}

describe("full-book encoder boundaries", () => {
  it("publishes finite full-book defaults", () => {
    expect(FULL_BOOK_EXPORT_LIMITS).toEqual({ maxSourceBytes: 128 * 1024 ** 2, maxTotalSourceBytes: 2 * 1024 ** 3, maxPcmBytes: 8 * 1024 ** 3, maxOutputBytes: 512 * 1024 ** 2, timeoutMs: 3600000 });
  });
  it.each(["hash", "outside symlink", "directory", "source size", "total size", "cancelled", "order", "invalid limit"])("rejects %s and leaves no output", async (scenario) => {
    const f = await fixture();
    try {
      const controller = new AbortController();
      let limits = {};
      let message = /changed before export/;
      if (scenario === "hash") f.input.chapters[0].sha256 = "0".repeat(64);
      if (scenario === "outside symlink") {
        const outside = path.join(f.directory, "outside.wav"); await fs.writeFile(outside, "synthetic source");
        await fs.unlink(f.input.chapters[0].filePath); await fs.symlink(outside, f.input.chapters[0].filePath); message = /outside/;
      }
      if (scenario === "directory") { f.input.chapters[0].filePath = f.sourceRoot; message = /regular file|outside/; }
      if (scenario === "source size") { limits = { maxSourceBytes: 2 }; message = /source.*limit/i; }
      if (scenario === "total size") { limits = { maxTotalSourceBytes: 2 }; message = /source.*limit/i; }
      if (scenario === "cancelled") { controller.abort(); message = /cancelled/; }
      if (scenario === "order") { f.input.expectedChapterIds = ["two"]; message = /correct order/; }
      if (scenario === "invalid limit") { limits = { maxOutputBytes: Infinity }; message = /limit/i; }
      await expect(encodeFullBookAudio(f.input, { ...f, limits, signal: controller.signal, ffmpeg: "/must-not-run" })).rejects.toThrow(message);
      expect(await fs.readdir(f.outputRoot)).toEqual([]);
    } finally { await f.cleanup(); }
  });
  it.each(["cancel", "timeout"])("kills and cleans a running encoder on %s", async (scenario) => {
    const f = await fixture();
    try {
      const executable = path.join(f.directory, "waiting-encoder");
      await fs.writeFile(executable, `#!${process.execPath}\nrequire('fs').writeFileSync(${JSON.stringify(path.join(f.directory, "pid"))}, String(process.pid)); setInterval(() => {}, 1000);`);
      await fs.chmod(executable, 0o700);
      const controller = new AbortController();
      const pending = encodeFullBookAudio(f.input, { ...f, ffmpeg: executable, signal: controller.signal, limits: { timeoutMs: scenario === "timeout" ? 2000 : 10000 } });
      const assertion = expect(pending).rejects.toThrow(scenario === "timeout" ? /timed out/ : /cancelled/);
      const started = Date.now();
      while (!await fs.stat(path.join(f.directory, "pid")).then(() => true, () => false) && Date.now() - started < 5000) await new Promise((resolve) => setTimeout(resolve, 10));
      if (scenario === "cancel") controller.abort();
      await assertion;
      const pid = Number(await fs.readFile(path.join(f.directory, "pid"), "utf8"));
      expect(() => process.kill(pid, 0)).toThrow();
      expect(await fs.readdir(f.outputRoot)).toEqual([]);
    } finally { await f.cleanup(); }
  }, 15000);
});

const runLocal = process.env.RUN_LOCAL_FULL_BOOK_EXPORT_TESTS === "1";
describe.runIf(runLocal)("real disk-based full-book encoding", () => {
  it.each(["mp3-128", "mp3-320", "m4b"] as const)("verifies every decoded sample across 21 chapters and 6+ minutes for %s", async (format) => {
    const f = await fixture();
    try {
      await runAudioTool("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=18", "-c:a", "pcm_s16le", f.input.chapters[0].filePath]);
      const sha256 = createHash("sha256").update(await fs.readFile(f.input.chapters[0].filePath)).digest("hex");
      const chapters = Array.from({ length: 21 }, (_, index) => ({ ...f.input.chapters[0], sha256, id: String(index), title: `Chapter ${index + 1}` }));
      const result = await encodeFullBookAudio({ ...f.input, format, chapters, expectedChapterIds: chapters.map((chapter) => chapter.id) }, f);
      expect(result.durationSeconds).toBe(378);
      expect(result.chapters).toHaveLength(21);
      expect(result.chapters.at(-1)?.endSample).toBe(378 * 48000);
      expect(result.byteLength).toBe((await fs.stat(result.filePath)).size);
      expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(await fs.readdir(path.dirname(result.filePath))).toEqual([`book.${result.extension}`]);
      expect(await fs.readdir(f.outputRoot)).toHaveLength(1);
      expect(result.probe.format.tags.title).toBe("Full book");
      if (format === "m4b") expect(result.probe.chapters).toHaveLength(21);
      await result.cleanup(); await result.cleanup();
      expect(await fs.readdir(f.outputRoot)).toEqual([]);
    } finally { await f.cleanup(); }
  }, 120000);
  it.each(["PCM", "output"])("refuses truncated %s without a final file", async (kind) => {
    const f = await fixture();
    try {
      await runAudioTool("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=2", f.input.chapters[0].filePath]);
      f.input.chapters[0].sha256 = createHash("sha256").update(await fs.readFile(f.input.chapters[0].filePath)).digest("hex");
      await expect(encodeFullBookAudio(f.input, { ...f, limits: kind === "PCM" ? { maxPcmBytes: 1024 } : { maxOutputBytes: 1024 } })).rejects.toThrow(/limit|verified/);
      expect(await fs.readdir(f.outputRoot)).toEqual([]);
    } finally { await f.cleanup(); }
  }, 30000);
});
