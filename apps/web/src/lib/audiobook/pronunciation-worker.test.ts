import { describe, expect, it } from "vitest";
import { preparePronunciationJob } from "./pronunciation-worker";

const scope = { ownerId: "author", bookId: "11111111-1111-4111-8111-111111111111", editionId: "22222222-2222-4222-8222-222222222222" };
function input() {
  return { scope: { ...scope }, snapshot: { scope: { ...scope }, revision: 1, rules: [{ word: "Mira", spokenAs: "Mee-ra" }, { word: "Bay", spokenAs: "Bey" }] }, originalText: "Mira Bay", chapterId: "chapter", voiceId: "voice", model: "model", language: "en" };
}
const enabled = { enableForLocalTests: true } as const;
describe("disconnected pronunciation worker", () => {
  it("is disabled by default even for malformed input", () => {
    expect(() => preparePronunciationJob(null)).toThrow("[audiobook pronunciation] Worker integration is disabled");
  });
  it.each(["ownerId", "bookId", "editionId"] as const)("rejects a snapshot from another %s", (key) => {
    const value = input();
    value.snapshot.scope[key] = "33333333-3333-4333-8333-333333333333";
    expect(() => preparePronunciationJob(value, enabled)).toThrow();
  });
  it("rejects malformed rules and route scope", () => {
    const value = input();
    value.snapshot.rules[0].word = "";
    expect(() => preparePronunciationJob(value, enabled)).toThrow();
    expect(() => preparePronunciationJob({ ...input(), scope: { ...scope, editionId: "bad" } }, enabled)).toThrow();
  });
  it("captures a deeply immutable snapshot without retaining mutable input", () => {
    const value = input();
    const job = preparePronunciationJob(value, enabled);
    value.snapshot.rules[0].spokenAs = "CHANGED";
    value.snapshot.rules.push({ word: "new", spokenAs: "newer" });
    value.snapshot.scope.ownerId = "other";
    value.snapshot.revision = 4;
    expect(job.snapshot.scope).toEqual(scope);
    expect(job.snapshot.revision).toBe(1);
    expect(job.snapshot.rules[0].spokenAs).toBe("Mee-ra");
    expect(job.narrationText).toBe("Mee-ra Bey");
    expect(Object.isFrozen(job)).toBe(true);
    expect(Object.isFrozen(job.snapshot)).toBe(true);
    expect(Object.isFrozen(job.snapshot.scope)).toBe(true);
    expect(Object.isFrozen(job.snapshot.rules)).toBe(true);
    expect(Object.isFrozen(job.snapshot.rules[0])).toBe(true);
  });
  it("uses a stable canonical SHA256 identity for reordered rules", () => {
    const value = input();
    const first = preparePronunciationJob(value, enabled);
    value.snapshot.rules.reverse();
    expect(preparePronunciationJob(value, enabled).cacheIdentity).toBe(first.cacheIdentity);
    expect(first.cacheIdentity).toMatch(/^[a-f0-9]{64}$/);
  });
  it("invalidates cache for edits, deletions and revisions", () => {
    const baseline = preparePronunciationJob(input(), enabled).cacheIdentity;
    const edited = input(); edited.snapshot.rules[0].spokenAs = "Meer-ah";
    const deleted = input(); deleted.snapshot.rules = [];
    const revised = input(); revised.snapshot.revision++;
    for (const value of [edited, deleted, revised]) expect(preparePronunciationJob(value, enabled).cacheIdentity).not.toBe(baseline);
  });
  it.each(["originalText", "chapterId", "voiceId", "model", "language"] as const)("includes %s in cache identity", (key) => {
    const value = input();
    const baseline = preparePronunciationJob(value, enabled).cacheIdentity;
    value[key] += "changed";
    expect(preparePronunciationJob(value, enabled).cacheIdentity).not.toBe(baseline);
  });
  it.each(["ownerId", "bookId", "editionId"] as const)("isolates cache by %s", (key) => {
    const value = input();
    const baseline = preparePronunciationJob(value, enabled).cacheIdentity;
    value.scope[key] = value.snapshot.scope[key] = "33333333-3333-4333-8333-333333333333";
    expect(preparePronunciationJob(value, enabled).cacheIdentity).not.toBe(baseline);
  });
  it("explicitly withholds manuscript timing when narration changes", () => {
    const job = preparePronunciationJob(input(), enabled);
    expect(job.originalText).toBe("Mira Bay");
    expect(job.narrationChanged).toBe(true);
    expect(job.manuscriptTiming).toBeNull();
    expect(job.manuscriptTimingReason).toBe("narration-changed");
    const unchanged = input(); unchanged.snapshot.rules = [];
    const originalJob = preparePronunciationJob(unchanged, enabled);
    expect(originalJob.narrationChanged).toBe(false);
    expect(originalJob.manuscriptTiming).toBeNull();
    expect(originalJob.manuscriptTimingReason).toBe("not-provided");
  });
});
