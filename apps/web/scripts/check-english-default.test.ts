import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const script = path.resolve("scripts/check-english-default.ts");
const tsx = createRequire(import.meta.url).resolve("tsx/cli");
const contentPath = "src/features/author/author-experience-data.ts";
const sampleContent = readFileSync(path.resolve(contentPath), "utf8");
const fixtures: string[] = [];

/**
 * Each case boots `tsx` in a child process to run the real gate over a fixture
 * repo, which costs several seconds before a single assertion runs. Vitest's 5s
 * default was comfortable when these were written and is not any more: the
 * suite began failing on timeouts alone while the gate itself still passed.
 * Sized for a loaded machine so it does not creep back.
 */
const SPAWN_TIMEOUT_MS = 60_000;

function check(files: Record<string, string>) {
  const cwd = mkdtempSync(path.join(tmpdir(), "verkli-english-gate-"));
  fixtures.push(cwd);
  for (const [relative, source] of Object.entries(files)) {
    const file = path.join(cwd, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, source);
  }
  return spawnSync(process.execPath, [tsx, script], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, TSX_DISABLE_CACHE: "1" },
    // Kill a hung child rather than letting it burn the case's whole budget.
    timeout: SPAWN_TIMEOUT_MS - 5_000,
  });
}

afterEach(() => {
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true });
});

describe("English default CLI gate", () => {
  it("accepts the reviewed multilingual book excerpts", () => {
    const result = check({ [contentPath]: sampleContent });
    expect(result.error).toBeUndefined();
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("check:english-default ok");
  }, SPAWN_TIMEOUT_MS);

  it("still fails for new Swedish interface text in the sample content file", () => {
    const result = check({ [contentPath]: `${sampleContent}\nexport const settingsLabel = "Inställningar";` });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Found 1 non-English copy candidate(s)");
    expect(result.stderr).toContain("Inställningar");
  }, SPAWN_TIMEOUT_MS);

  it("does not allow the book excerpts as interface copy in other files", () => {
    const result = check({ "src/components/author/Label.tsx": 'export const label = "Den hemsökta dagboken";' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Den hemsökta dagboken");
  }, SPAWN_TIMEOUT_MS);

  it("rejects changed non-English text even in the allowed file", () => {
    const result = check({ [contentPath]: sampleContent.replace("Den hemsökta dagboken", "Den hemsökta dagboken — nästa kapitel") });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Found 1 non-English copy candidate(s)");
    expect(result.stderr).toContain("nästa kapitel");
  }, SPAWN_TIMEOUT_MS);
});
