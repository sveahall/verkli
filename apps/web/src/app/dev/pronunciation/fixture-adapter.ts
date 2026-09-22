import { parsePronunciationSnapshot, pronunciationRulesSchema, type PronunciationAdapter, type PronunciationScope, type PronunciationSnapshot } from "@/lib/audiobook/pronunciation";
export type FixtureMode = "normal" | "save-error" | "load-error" | "conflict" | "delayed";
/** Synthetic in-memory fixture only. This is not an authorization or persistent store. */
export function createFixtureAdapter(mode: () => FixtureMode): PronunciationAdapter {
  const rows = new Map<string, PronunciationSnapshot>();
  const read = (scope: PronunciationScope) => structuredClone(rows.get(JSON.stringify(scope)) ?? { scope, revision: 0, rules: [] });
  const wait = (captured: FixtureMode) => new Promise((resolve) => setTimeout(resolve, captured === "delayed" ? 1800 : 200));
  return {
    async load(scope) {
      const captured = mode(); await wait(captured);
      if (captured === "load-error") throw new Error("Synthetic load failure");
      return parsePronunciationSnapshot(read(scope), scope);
    },
    async save(scope, expectedRevision, input) {
      const rules = pronunciationRulesSchema.parse(input);
      const captured = mode(); await wait(captured);
      if (captured === "save-error") throw new Error("Synthetic save failure");
      let current = read(scope);
      if (captured === "conflict") {
        current = { scope: { ...scope }, revision: current.revision + 1, rules: [{ word: "Bay", spokenAs: "Bey" }] };
        rows.set(JSON.stringify(scope), current);
      }
      // No await between compare and set: local fixture emulates an atomic CAS.
      if (current.revision !== expectedRevision) return { kind: "conflict", snapshot: structuredClone(current) };
      const snapshot = { scope: { ...scope }, revision: current.revision + 1, rules };
      rows.set(JSON.stringify(scope), structuredClone(snapshot));
      return { kind: "saved", snapshot };
    },
  };
}
