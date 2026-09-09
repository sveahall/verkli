/**
 * Guards the genre suggestion matcher against the bug it just had.
 *
 * `scoreGenreSlug` looked its keyword list up with a PARTIAL key match:
 *
 *   Object.keys(GENRE_SIGNALS).find(k => slug.includes(k) || k.includes(slug))
 *
 * `"non-fiction".includes("fiction")` is true and `non-fiction` is declared
 * first, so the slug `fiction` resolved to the non-fiction list and was scored
 * on "history", "research", "policy", "economy". The `fiction` list was
 * unreachable. Nothing failed: the author just saw a confidently wrong
 * suggestion, or "No clear genre detected".
 *
 * These tests read the route source rather than importing it, because the
 * module is a Next route handler whose imports pull in auth and the Supabase
 * server client. The thing worth protecting is a data invariant — which keys
 * exist — and that is visible in the source.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = readFileSync(join(__dirname, "route.ts"), "utf8");

/**
 * The slugs in the live `genres` table, read from production on 2026-09-09:
 *   select slug from genres order by slug  -> 16 rows
 * A key that is not in this list can never be selected, because the scorer is
 * only ever called with a slug that came from this table.
 */
const LIVE_GENRE_SLUGS = [
  "biography",
  "children",
  "comics",
  "drama",
  "fantasy",
  "fiction",
  "history",
  "horror",
  "mystery",
  "non-fiction",
  "poetry",
  "romance",
  "sci-fi",
  "self-help",
  "thriller",
  "young-adult",
];

/** The keys declared in the GENRE_SIGNALS object literal. */
function signalKeys(): string[] {
  const start = SOURCE.indexOf("GENRE_SIGNALS");
  expect(start).toBeGreaterThan(-1);
  const body = SOURCE.slice(start, SOURCE.indexOf("\n};", start));
  // Keys at one level of indentation: `  foo: [` or `  "foo": [`
  return [...body.matchAll(/^\s{2}"?([a-z-]+)"?:\s*\[/gm)].map((m) => m[1]);
}

describe("genre suggestion signals", () => {
  it("looks its keyword list up by exact key", () => {
    // The specific expression that caused the collision must be gone.
    expect(SOURCE).not.toMatch(/slug\.includes\(k\)\s*\|\|\s*k\.includes\(slug\)/);
    expect(SOURCE).toContain("GENRE_SIGNALS[slug]");
  });

  it("declares no key that is not a real genre", () => {
    // `adventure` and `historical` were both here and neither is a genre, so
    // their keyword lists could never be reached.
    const orphans = signalKeys().filter((k) => !LIVE_GENRE_SLUGS.includes(k));
    expect(orphans).toEqual([]);
  });

  it("covers every live genre with a keyword list", () => {
    // Not strictly required — there is a deliberate fallback to matching the
    // genre's own name — but an uncovered genre can only ever be suggested when
    // the author has already typed its name, which makes the suggestion
    // useless. Five genres were in this state.
    const uncovered = LIVE_GENRE_SLUGS.filter((s) => !signalKeys().includes(s));
    expect(uncovered).toEqual([]);
  });

  it("has no key that is a substring of another key", () => {
    // This is what made a partial match dangerous rather than merely sloppy.
    // With exact lookup it is no longer a bug, but a pair like this is a sign
    // someone has reintroduced overlapping keys and reasoned about them
    // loosely.
    const keys = signalKeys();
    const overlapping = keys.flatMap((a) =>
      keys.filter((b) => a !== b && b.includes(a)).map((b) => `${a} ⊂ ${b}`)
    );
    // `fiction` ⊂ `non-fiction` is real and intended: both are live genres.
    // It is listed explicitly so this test documents it rather than hiding it.
    expect(overlapping).toEqual(["fiction ⊂ non-fiction"]);
  });

  it("keeps the fiction list reachable and distinct from non-fiction", () => {
    const start = SOURCE.indexOf("\n  fiction: [");
    expect(start).toBeGreaterThan(-1);
    const fictionList = SOURCE.slice(start, SOURCE.indexOf("],", start));
    expect(fictionList).toContain("novel");
    // A word from the non-fiction list must not appear in the fiction list, or
    // the two are no longer telling anything apart.
    expect(fictionList).not.toContain("policy");
    expect(fictionList).not.toContain("economy");
  });
});
