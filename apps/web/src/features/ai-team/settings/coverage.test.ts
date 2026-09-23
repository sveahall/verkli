import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The master switch is only a setting if no AI route forgets it. A new route
 * that spends money on a model has to opt in here deliberately, which is the
 * point: this list fails loudly rather than letting a gap ship unnoticed.
 */
const GATED_ROUTES = [
  "books/[id]/ai/chat",
  "books/[id]/agent/run",
  // Apply spends nothing on a model, but it is the moment AI-authored changes
  // reach the manuscript. A switch that still lets a pending plan land is not
  // an off switch.
  "books/[id]/agent/apply",
  "books/[id]/editorial/review",
  "books/[id]/editorial/book-analysis",
  "books/[id]/audiobook/preview",
  "books/[id]/audiobook/generate",
  // Checkout takes payment for narration that `generate` would then refuse.
  "books/[id]/audiobook/checkout",
  "books/[id]/translate",
  "books/[id]/translation-preview",
  "books/[id]/translation-quality",
  "books/[id]/trailer/build",
  "author/marketing/posts/[id]/generate-trailer",
  "marketing/video/generate",
  "ai/text-to-video",
];

describe("AI master switch coverage", () => {
  it.each(GATED_ROUTES)("%s enforces the account AI switch server-side", (route) => {
    const source = readFileSync(join(process.cwd(), "src/app/api", route, "route.ts"), "utf8");
    // The chat route resolves the settings itself so it can reuse them for
    // personalisation; every other route uses the one-line guard.
    expect(source).toMatch(/aiDisabledResponse|requireAiEnabled/);
  });
});
