import "server-only";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { exportLocalAudio } from "./export-local";
import { EXPORT_SAMPLE_RATE, type ExportFormat } from "./export-contract";
export type ExportFixtureScenario = "complete" | "missing" | "encoder-error" | "size-limit";

/** Owned synthetic PCM only; no user recording or speech-provider input. */
function toneWav(rate: number, seconds: number, frequency: number): Buffer {
  const samples = Math.round(rate * seconds), wav = Buffer.alloc(44 + samples * 2);
  wav.write("RIFF", 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) wav.writeInt16LE(Math.round(Math.sin(i / rate * frequency * Math.PI * 2) * 4000), 44 + i * 2);
  return wav;
}
export async function createSyntheticExport(format: ExportFormat, scenario: ExportFixtureScenario, signal?: AbortSignal) {
  if (signal?.aborted) throw new Error("Audio export was cancelled.");
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "verkli-export-source-"));
  try {
    const source = [{ id: "departure", title: "Avfärd", rate: 48000, seconds: 2.25, frequency: 220 }, { id: "crossing", title: "Över vattnet", rate: 32000, seconds: 3.125, frequency: 440 }, { id: "return", title: "Återkomst", rate: 44100, seconds: 4.5, frequency: 660 }];
    const chapters = [];
    for (const chapter of source) {
      const audio = toneWav(chapter.rate, chapter.seconds, chapter.frequency), filePath = path.join(directory, `${chapter.id}.wav`);
      await fs.writeFile(filePath, audio);
      chapters.push({ id: chapter.id, title: chapter.title, filePath, sha256: createHash("sha256").update(audio).digest("hex") });
    }
    const result = await exportLocalAudio({ editionId: "synthetic-swedish", format, metadata: { title: "Vägen hem", author: "Demo author", narrator: "Synthetic tones", language: "swe" }, expectedChapterIds: source.map((chapter) => chapter.id), chapters: scenario === "missing" ? chapters.slice(0, 2) : chapters }, { sourceRoot: directory, signal, ffmpeg: scenario === "encoder-error" ? path.join(directory, "missing-ffmpeg") : undefined, maxOutputBytes: scenario === "size-limit" ? 1 : undefined });
    // Verify chapter order from the actual decoded output, not metadata alone.
    const toneFrequencies = result.chapters.map((chapter) => {
      const start = chapter.startSample + EXPORT_SAMPLE_RATE / 2, count = EXPORT_SAMPLE_RATE / 2;
      let crossings = 0, squared = 0;
      for (let i = start; i < start + count; i++) {
        const sample = result.verifiedPcm.readInt16LE(i * 2), previous = result.verifiedPcm.readInt16LE((i - 1) * 2);
        if (previous <= 0 && sample > 0) crossings++;
        squared += sample * sample;
      }
      if (Math.sqrt(squared / count) < 1000) throw new Error("Synthetic export tone verification failed.");
      return crossings / (count / EXPORT_SAMPLE_RATE);
    });
    toneFrequencies.forEach((frequency, i) => { if (Math.abs(frequency - source[i].frequency) > 4) throw new Error("Synthetic export chapter order verification failed."); });
    return { ...result, verification: { toneFrequencies } };
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
}
