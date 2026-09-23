/**
 * Per-user storage accounting.
 *
 * The path convention is not uniform, and the difference matters: a bucket keyed
 * by book id attributes through `books.author_id`, while one keyed by user id
 * attributes directly. Both were verified against production rather than read
 * off the upload code, because several buckets are written from more than one
 * place.
 */
export type OwnerKind = "user" | "book" | "none";

export const BUCKET_OWNER_KIND: Record<string, OwnerKind> = {
  // <userId>/...
  avatars: "user",
  book_covers: "user",
  "book-imports": "user",
  "print-artwork": "user",
  tts_previews: "user",
  // <bookId>/...
  audiobooks: "book",
  "chapter-media": "book",
  "marketing-media": "book",
  "content-assets": "book",
  "tts-outputs": "book",
  // Keyed by neither: a shared namespace with no single owner.
  "book-downloads": "none",
};

export type StoredFile = { path: string; size: number | null };

export type BucketSummary = {
  byOwner: Map<string, number>;
  /** Bytes in the bucket that resolve to no owner, e.g. `audiobooks/cache`. */
  unattributedBytes: number;
  /** Files the listing returned without a size; skipped, never counted as 0. */
  unknownSizeCount: number;
  totalBytes: number;
};

export function summarizeFiles(
  files: StoredFile[],
  ownerOf: (path: string) => string | null
): BucketSummary {
  const byOwner = new Map<string, number>();
  let unattributedBytes = 0;
  let unknownSizeCount = 0;
  let totalBytes = 0;

  for (const file of files) {
    if (typeof file.size !== "number" || !Number.isFinite(file.size)) {
      unknownSizeCount += 1;
      continue;
    }
    totalBytes += file.size;
    const owner = ownerOf(file.path);
    if (!owner) {
      unattributedBytes += file.size;
      continue;
    }
    byOwner.set(owner, (byOwner.get(owner) ?? 0) + file.size);
  }

  return { byOwner, unattributedBytes, unknownSizeCount, totalBytes };
}
