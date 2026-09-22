import { afterEach, describe, expect, it, vi } from "vitest";
import { createFixtureAdapter, type FixtureMode } from "./fixture-adapter";
const scope = { ownerId: "owner", bookId: "book", editionId: "en" };
const rules = [{ word: "Mira", spokenAs: "Mee-ra" }];
afterEach(() => vi.useRealTimers());
describe("local pronunciation adapter", () => {
  it("isolates owner/edition and resolves simultaneous saves using CAS", async () => {
    vi.useFakeTimers();
    const adapter = createFixtureAdapter(() => "normal");
    const requests = [adapter.save(scope, 0, rules), adapter.save(scope, 0, [])];
    await vi.runAllTimersAsync();
    expect((await Promise.all(requests)).map((result) => result.kind)).toEqual(["saved", "conflict"]);
    for (const other of [{ ...scope, ownerId: "other" }, { ...scope, editionId: "sv" }]) {
      const loaded = adapter.load(other); await vi.runAllTimersAsync();
      expect(await loaded).toEqual({ scope: other, revision: 0, rules: [] });
    }
  });
  it("failed save does not become persisted state", async () => {
    vi.useFakeTimers(); let mode: FixtureMode = "save-error";
    const adapter = createFixtureAdapter(() => mode);
    const save = expect(adapter.save(scope, 0, rules)).rejects.toThrow("Synthetic save failure");
    await vi.runAllTimersAsync(); await save;
    mode = "normal";
    const load = adapter.load(scope); await vi.runAllTimersAsync();
    expect((await load).revision).toBe(0);
  });
});
