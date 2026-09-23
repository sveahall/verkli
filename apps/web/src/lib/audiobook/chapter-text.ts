/**
 * The character count an audiobook job is measured by.
 *
 * This exists as its own module for one reason: the length guard that runs
 * *before* Stripe charges 299 SEK and the cap the worker enforces *after* the
 * charge must agree to the character. If they disagree, an author pays and then
 * the job dies on a cap the checkout said was fine — and the paid session
 * cannot be retried, because the client strips `session_id` from the URL.
 *
 * So both callers import from here. Do not reimplement the walk.
 *
 * Note there are two other text extractors in this codebase — `extractText` in
 * lib/book-translation.ts and `extractTextFromTiptapNode` in lib/tiptap-content.ts.
 * Neither is reused here on purpose: they differ in how they join blocks, and a
 * different join means a different character count, which is exactly the
 * divergence this module exists to prevent. This is a lift of what the audiobook
 * worker already did, unchanged.
 *
 * Deliberately no `import "server-only"`: the audiobook worker imports this from
 * a tsx script outside Next, where that package throws.
 */

function walk(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as Record<string, unknown>;
  if ("text" in n && typeof n.text === "string") {
    return n.text;
  }
  if ("content" in n && Array.isArray(n.content)) {
    return n.content.map(walk).join("");
  }
  return "";
}

/** Plain narration text for one chapter. Tiptap JSON, or raw text if unparseable. */
export function getChapterText(content: string | null): string {
  if (!content) return "";
  try {
    const parsed = JSON.parse(content);
    return walk(parsed);
  } catch {
    return String(content).trim();
  }
}

/**
 * Total characters a whole-book job will narrate. This is the number compared
 * against TTS_JOB_CAP_CHARS, in both the pre-charge guard and the worker.
 */
export function sumChapterTextLength(
  chapters: readonly { content: string | null }[]
): number {
  return chapters.reduce((sum, ch) => sum + getChapterText(ch.content).length, 0);
}
