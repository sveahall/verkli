import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createSyntheticExport } from "./export-fixture";
import { exportLocalAudio, runAudioTool } from "./export-local";
describe("local export source boundaries", () => {
  it("rejects changed sources and symlinks outside the source root before encoding", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "verkli-export-test-"));
    try {
      const root = path.join(directory, "sources");
      await fs.mkdir(root);
      const source = path.join(root, "chapter.wav");
      await fs.writeFile(source, "changed synthetic source");
      const input = { editionId: "synthetic", format: "m4b", metadata: { title: "Demo", author: "Demo", narrator: "Tones", language: "swe" }, expectedChapterIds: ["one"], chapters: [{ id: "one", title: "One", filePath: source, sha256: "0".repeat(64) }] };
      const options = { sourceRoot: root, ffmpeg: path.join(directory, "must-not-run") };
      await expect(exportLocalAudio(input, options)).rejects.toThrow("changed before export");
      const outside = path.join(directory, "outside.wav");
      await fs.writeFile(outside, "outside synthetic source");
      await fs.unlink(source);
      await fs.symlink(outside, source);
      await expect(exportLocalAudio(input, options)).rejects.toThrow("outside the export workspace");
    } finally { await fs.rm(directory, { recursive: true, force: true }); }
  });
  it("stops a running local subprocess when the request is cancelled", async () => {
    const controller = new AbortController();
    const processResult = runAudioTool(process.execPath, ["-e", "setInterval(() => {}, 1000)"], controller.signal);
    const assertion = expect(processResult).rejects.toThrow("cancelled");
    controller.abort();
    await assertion;
  });
});
const runLocal = process.env.RUN_LOCAL_AUDIO_EXPORT_TESTS === "1";
describe.runIf(runLocal)("real local synthetic audio exports", () => {
  it.each(["mp3-128", "mp3-320", "m4b"] as const)("encodes and verifies %s", async (format) => {
    const result = await createSyntheticExport(format, "complete");
    expect(result.audio.length).toBeGreaterThan(1000);
    expect(result.durationSeconds).toBe(9.875);
    expect(result.chapters.map((chapter) => chapter.startSample)).toEqual([0, 108000, 258000]);
    expect(result.chapters.map((chapter) => chapter.endSample)).toEqual([108000, 258000, 474000]);
    expect(result.probe.format.tags.title).toBe("Vägen hem");
    expect(result.probe.format.tags.author).toBe("Demo author");
    expect(result.probe.format.tags.narrator).toBe("Synthetic tones");
    expect(result.probe.streams.filter((stream) => stream.codec_type === "audio")).toHaveLength(1);
    if (format === "m4b") expect(result.probe.chapters.map((chapter) => chapter.tags.title)).toEqual(["Avfärd", "Över vattnet", "Återkomst"]);
    else expect(Number(result.probe.streams.find((stream) => stream.codec_type === "audio")?.bit_rate)).toBe(format === "mp3-320" ? 320000 : 128000);
    expect(result.verification.toneFrequencies.map((hz) => Math.round(hz / 10) * 10)).toEqual([220, 440, 660]);
  }, 60000);
  it.each(["missing", "encoder-error", "size-limit"] as const)("refuses a ready file for %s", async (scenario) => {
    await expect(createSyntheticExport("m4b", scenario)).rejects.toThrow();
  }, 60000);
  it("does no encoding for an already cancelled request", async () => {
    const controller = new AbortController(); controller.abort();
    await expect(createSyntheticExport("m4b", "complete", controller.signal)).rejects.toThrow();
  });
});
