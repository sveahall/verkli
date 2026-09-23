import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The master AI switch is only a setting if no route forgets it.
 *
 * The first version of this test asserted a hand-written list of routes — so it
 * passed while three routes that spend money on a model had no guard at all
 * (cover generation, whole-book analysis, launch copy). A list I wrote could
 * only ever confirm the blind spot I already had.
 *
 * This derives the list instead: find every route that reaches a model, then
 * require each one to check the switch. A new AI route fails here on the day it
 * is written, without anybody remembering to add it.
 */

/**
 * Calls that reach a paid model, directly or through a helper. Add to this when
 * a new provider or generation helper appears — that is the one list that has
 * to be maintained, and getting it wrong fails open loudly rather than quietly:
 * a missed entry means a route is not required to be gated, which is exactly
 * what the derived scan is meant to prevent, so keep it broad.
 */
const MODEL_CALLS = [
  // The repo's own "I am about to spend" marker. Broader and more durable than
  // any list of generation function names — which is what the previous version
  // of this test used, and why it missed whole-book analysis.
  /checkBudget\s*\(/,
  /generateWritingAssistantReply\s*\(/,
  /generateCoverImages\s*\(/,
  /generateLaunchCopy\s*\(/,
  /generateImageToVideo\s*\(/,
  /getTranslatorForPair\s*\(/,
  /generateEditorialReview\s*\(/,
  /generateBookAnalysis\w*\s*\(/,
  /synthesize\w*\s*\(/,
  /new\s+Anthropic\s*\(/,
  /new\s+OpenAI\s*\(/,
];

/** The guard, or the chat route's own resolve-and-check. */
const GUARDED = /aiDisabledResponse\s*\(|requireAiEnabled\s*\(/;

/**
 * Routes that reach a model but are deliberately not gated, each with the
 * reason. Anything else that calls a model must be gated.
 */
const EXEMPT = new Map<string, string>([
  // Deleting a cloned voice is cleanup, not generation: blocking it would
  // strand a dangling ElevenLabs voice on an account that turned AI off.
  ["src/app/api/author/voices/[id]/route.ts", "cleanup only, no generation"],
]);

/** Every `route.ts` under the API tree, found by walking it. */
function routeFiles(dir = "src/app/api", found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) routeFiles(full, found);
    else if (entry.name === "route.ts") found.push(full);
  }
  return found.sort();
}

describe("AI master switch coverage", () => {
  const spending = routeFiles().filter((file) => {
    const source = readFileSync(file, "utf8");
    return MODEL_CALLS.some((pattern) => pattern.test(source));
  });

  it("finds the AI routes by what they call, not by a list someone maintained", () => {
    // A scan that matches nothing would make every assertion below vacuous.
    expect(spending.length).toBeGreaterThanOrEqual(8);
  });

  it.each(["src/app/api/books/[id]/cover/generate/route.ts", "src/app/api/books/[id]/marketing/generate/route.ts", "src/app/api/books/[id]/editorial/book-analysis/route.ts"])(
    "%s is in the scan (it was missed once)",
    (file) => {
      expect(spending).toContain(file);
    }
  );

  it("requires every route that reaches a model to check the account switch", () => {
    const ungated = spending.filter((file) => !EXEMPT.has(file) && !GUARDED.test(readFileSync(file, "utf8")));
    expect(
      ungated,
      `These routes spend money on a model without checking the account AI switch:\n  ${ungated.join("\n  ")}\n` +
        `Add aiDisabledResponse(userId) after the auth gate, or add an entry to EXEMPT with the reason.`
    ).toEqual([]);
  });
});
