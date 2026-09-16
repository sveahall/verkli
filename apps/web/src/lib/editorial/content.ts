export type ReviewNode = {
  type: string;
  text?: string;
  content?: ReviewNode[];
  [key: string]: unknown;
};

function nodeText(node: ReviewNode): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  return (node.content ?? []).map(nodeText).join(
    ["doc", "bulletList", "orderedList", "listItem", "blockquote"].includes(node.type) ? "\n\n" : "",
  );
}

export function reviewText(content: string | null): string {
  if (!content) return "";
  try {
    const doc = JSON.parse(content) as ReviewNode;
    if (doc?.type === "doc") return nodeText(doc).trim();
  } catch { /* Legacy plain text is still readable. */ }
  return content.trim();
}

/** No excerpting: the concatenated parts always equal the entire input. */
export function splitReviewText(text: string): string[] {
  const parts: string[] = [];
  while (text.length > 12000) {
    const boundary = text.lastIndexOf("\n", 11999);
    let end = boundary > 6000 ? boundary + 1 : 12000;
    // Keep supplementary characters whole so a quoted correction cannot remove
    // only one UTF-16 surrogate and leave corrupted text in the manuscript.
    const before = text.charCodeAt(end - 1);
    const after = text.charCodeAt(end);
    if (before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff) end -= 1;
    parts.push(text.slice(0, end));
    text = text.slice(end);
  }
  if (text.length) parts.push(text);
  return parts;
}

/** Exact, unique, single-block replacements preserve unrelated nodes and marks. */
export function applyCorrection(content: string | null, original: string, replacement: string): ReviewNode {
  let doc: ReviewNode;
  try {
    doc = JSON.parse(content ?? "") as ReviewNode;
    if (doc?.type !== "doc" || !Array.isArray(doc.content)) throw new Error();
  } catch { throw new Error("Open and save this chapter in the editor before applying corrections."); }
  if (!original || original === replacement) throw new Error("This suggestion does not contain a change.");
  const full = nodeText(doc);
  const first = full.indexOf(original);
  if (first < 0) throw new Error("The quoted text is no longer present. Run a new review.");
  if (full.indexOf(original, first + 1) >= 0) throw new Error("The quoted text occurs more than once. Make this change in the editor.");
  let applied = false;
  const visit = (node: ReviewNode) => {
    if (["paragraph", "heading"].includes(node.type)) {
      const text = nodeText(node);
      const start = text.indexOf(original);
      if (start < 0 || original.includes("\n") || replacement.includes("\n")) return;
      const end = start + original.length;
      let offset = 0;
      let inserted = false;
      node.content = (node.content ?? []).flatMap((child) => {
        const length = nodeText(child).length;
        const position = offset;
        offset += length;
        if (child.type !== "text" || offset <= start || position >= end) return [child];
        const before = (child.text ?? "").slice(0, Math.max(0, start - position));
        const after = (child.text ?? "").slice(Math.max(0, end - position));
        const nextText = before + (inserted ? "" : replacement) + after;
        inserted = true;
        return nextText ? [{ ...child, text: nextText }] : [];
      });
      applied = inserted;
      return;
    }
    node.content?.forEach(visit);
  };
  visit(doc);
  if (!applied) throw new Error("Only changes within a single paragraph can be applied here. Use the editor for this suggestion.");
  return doc;
}
