type ChapterHashInput = {
  title: string | null | undefined;
  content: string | null | undefined;
};

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256Hex(value: string): Promise<string> {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return toHex(digest);
}

export async function buildChapterContentHash(chapter: ChapterHashInput): Promise<string> {
  const normalizedTitle = (chapter.title ?? "").trim();
  const normalizedContent = chapter.content ?? "";
  return sha256Hex(`${normalizedTitle}\n${normalizedContent}`);
}
