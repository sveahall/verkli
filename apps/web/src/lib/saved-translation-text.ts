/** Display serialization only. Review fingerprints must continue to use stored content. */
const BLOCKS = new Set(["paragraph", "heading", "blockquote", "codeBlock", "bulletList", "orderedList", "listItem", "horizontalRule"]);

function nodeText(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const node = value as { type?: string; text?: unknown; content?: unknown[] };
  if (typeof node.text === "string") return node.text;
  if (node.type === "hardBreak") return "\n";
  if (!Array.isArray(node.content)) return "";
  const hasBlocks = node.content.some((child) => !!child && typeof child === "object" && BLOCKS.has((child as { type: string }).type));
  return node.content.map(nodeText).join(hasBlocks ? "\n\n" : "");
}

export function savedTranslationText(content: string | null): string {
  if (!content) return "";
  const trimmed = content.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const document: unknown = JSON.parse(trimmed);
      return (Array.isArray(document) ? document.map(nodeText).join("\n\n") : nodeText(document)).trim();
    } catch { /* Plain prose may begin with a brace. Keep it as written. */ }
  }
  return trimmed;
}
