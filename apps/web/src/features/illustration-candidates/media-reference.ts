import { candidateBaseUrl, scopeKeySchema, type CandidateScopeKey } from "./contracts";

const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const path = new RegExp(`^/api/books/(${uuid})/editions/(${uuid})/chapters/(${uuid})/illustrations/(${uuid})/image$`);

export function candidateImageReference(scope: CandidateScopeKey, assetId: string): string {
  return `${candidateBaseUrl(scope)}/${assetId}/image`;
}

export function parseCandidateImage(value: unknown): { scope: CandidateScopeKey; assetId: string } | null {
  if (typeof value !== "string") return null;
  const match = path.exec(value);
  if (!match) return null;
  const parsed = scopeKeySchema.safeParse({ bookId: match[1], editionId: match[2], chapterId: match[3] });
  if (!parsed.success) return null;
  return { scope: parsed.data, assetId: match[4] };
}

export function readerCandidateImageUrl(scope: CandidateScopeKey, assetId: string): string {
  return candidateImageReference(scope, assetId).replace("/api/books/", "/api/reader/books/");
}

function mapImages(input: unknown, visit: (src: unknown) => unknown): unknown {
  let count = 0;
  function walk(value: unknown, depth: number): unknown {
    if (++count > 30_000 || depth > 64) throw new Error("Illustration document exceeds the read limit.");
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    const node = value as Record<string, unknown>;
    const attrs = node.attrs && typeof node.attrs === "object" && !Array.isArray(node.attrs) ? node.attrs as Record<string, unknown> : null;
    return {
      ...node,
      ...(node.type === "image" && attrs ? { attrs: { ...attrs, src: visit(attrs.src) } } : {}),
      ...(Array.isArray(node.content) ? { content: node.content.map((child) => walk(child, depth + 1)) } : {}),
    };
  }
  return walk(input, 0);
}

/** Only structured image nodes count; prose, arbitrary attributes and URLs do not grant access. */
export function hasCandidateImage(content: unknown, scope: CandidateScopeKey, assetId: string): boolean {
  try {
    const parsed = typeof content === "string" ? JSON.parse(content) : content;
    let found = false;
    mapImages(parsed, (src) => { if (src === candidateImageReference(scope, assetId)) found = true; return src; });
    return found;
  } catch { return false; }
}

export function hasAnyCandidateImage(content: unknown, scope: CandidateScopeKey): boolean {
  try {
    const parsed = typeof content === "string" ? JSON.parse(content) : content;
    let found = false;
    mapImages(parsed, (src) => {
      const reference = parseCandidateImage(src);
      if (reference && reference.scope.bookId === scope.bookId && reference.scope.editionId === scope.editionId && reference.scope.chapterId === scope.chapterId) found = true;
      return src;
    });
    return found;
  } catch { return false; }
}

/** Keep the stored document intact. Each reader request must pass the protected proxy again. */
export function resolveReaderImages<T>(content: T): T {
  return mapImages(content, (src) => {
    const reference = parseCandidateImage(src);
    return reference ? readerCandidateImageUrl(reference.scope, reference.assetId) : src;
  }) as T;
}
