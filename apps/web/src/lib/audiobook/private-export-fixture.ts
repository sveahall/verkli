import "server-only";
import { PrivateExportError, privateContentHash, type PrivateExportSnapshot } from "./private-export-contract";
import { audioObjectHash } from "./timing-storage";
import type { PrivateExportDependencies } from "./private-export-service";
export const PRIVATE_FIXTURE_BOOK = "00000000-0000-4000-8000-000000000002";
export const PRIVATE_FIXTURE_EDITION = "00000000-0000-4000-8000-000000000003";
export const PRIVATE_FIXTURE_SCENARIOS = ["complete", "missing", "hash", "stale", "denied", "wrong-edition", "smoke", "read-error"] as const;
export type PrivateFixtureScenario = typeof PRIVATE_FIXTURE_SCENARIOS[number];
function makeTone(seconds: number, frequency: number) {
  const rate = 48000, samples = rate * seconds, wav = Buffer.alloc(44 + samples * 2);
  wav.write("RIFF", 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) wav.writeInt16LE(Math.round(Math.sin(i / rate * frequency * 2 * Math.PI) * 4000), 44 + i * 2);
  return wav;
}
/** Only generated PCM and fabricated metadata. No Supabase/client/provider dependency. */
export function createPrivateExportFixture(scenario: PrivateFixtureScenario): PrivateExportDependencies {
  const ownerId = "00000000-0000-4000-8000-000000000001", objects = new Map<string, Buffer>();
  const source: PrivateExportSnapshot = { ownerId, book: { id: PRIVATE_FIXTURE_BOOK, authorId: ownerId, title: "Synthetic export edition", deletedAt: null, demoRunId: null }, edition: { id: PRIVATE_FIXTURE_EDITION, bookId: PRIVATE_FIXTURE_BOOK, language: "en", demoRunId: null }, authorName: "Fixture author", asset: { id: "00000000-0000-4000-8000-000000000005", bookId: PRIVATE_FIXTURE_BOOK, language: "en", status: "generated", isSmoke: scenario === "smoke", demoRunId: null }, chapterCount: scenario === "missing" ? 3 : 2, chapters: [] };
  for (let index = 0; index < 2; index++) {
    const id = `00000000-0000-4000-8000-00000000001${index}`, title = index === 0 ? "Departure" : "Arrival", text = title, audio = makeTone(index + 2, index === 0 ? 220 : 440);
    const path = `cache/${PRIVATE_FIXTURE_BOOK}/${id}-${audioObjectHash(audio, text)}.wav`;
    objects.set(path, audio);
    objects.set(`${path}.timing.json`, Buffer.from(JSON.stringify({ version: 1, chapterId: id, bookVersionId: PRIVATE_FIXTURE_EDITION, audioPath: path, timing: { sourceText: text, words: [{ word: text, start: 0, end: index + 1.5, startOffset: 0, endOffset: text.length }] } })));
    source.chapters.push({ id, bookId: PRIVATE_FIXTURE_BOOK, editionId: PRIVATE_FIXTURE_EDITION, order: index, title, text, cache: { id: `00000000-0000-4000-8000-00000000002${index}`, chapterId: id, editionId: PRIVATE_FIXTURE_EDITION, contentHash: privateContentHash(text, id, PRIVATE_FIXTURE_EDITION), voiceId: "synthetic-tone", modelId: "synthetic", language: "en", path, bytes: audio.length } });
  }
  let reads = 0;
  return {
    async authorize() { if (scenario === "denied") throw new PrivateExportError(403, "AUTHOR_REQUIRED", "The simulated account does not own this edition."); return ownerId; },
    async snapshot() { reads++; const value = structuredClone(source); if (scenario === "stale" && reads > 1) value.book.title = "Changed synthetic edition"; if (scenario === "wrong-edition") value.edition.id = "00000000-0000-4000-8000-000000000099"; return value; },
    async readObject(path) { if (scenario === "read-error") throw new Error("Synthetic storage unavailable"); const bytes = objects.get(path); if (!bytes) throw new Error("Synthetic object missing"); return scenario === "hash" && path.endsWith(".wav") ? Buffer.alloc(bytes.length) : Buffer.from(bytes); },
    async rateLimit() { return true; },
  };
}
