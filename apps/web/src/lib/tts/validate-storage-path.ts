import { getAudiobookStorageBucket } from "./storage";

/** DB/JSONB references are untrusted, even after the owning book is authorized. */
export function validateAudiobookStoragePath(
  value: unknown,
  bucket: unknown,
  bookId: string,
  logPrefix: string
): string | null {
  if (value == null || value === "") return null;

  const reject = (reason: string) => {
    // Never log the reference: it may contain a private URL or attacker input.
    console.warn(`${logPrefix} rejected audiobook storage reference`, { bookId, reason });
    return null;
  };

  // Missing bucket metadata is supported for legacy rows. It never chooses a bucket.
  if (bucket != null && (typeof bucket !== "string" || (bucket.trim() && bucket.trim() !== getAudiobookStorageBucket()))) {
    return reject("unexpected bucket");
  }
  if (typeof value !== "string") return reject("invalid path");
  const path = value.trim();
  const segments = path.split("/");
  if (!/^[a-zA-Z0-9._/-]+$/.test(path) || segments.some((part) => !part || part === "." || part === "..")) {
    return reject("non-canonical path");
  }

  // Current and historical worker outputs use these book-scoped namespaces.
  const isBookOutput = segments.length === 2 && segments[0] === bookId &&
    /^audiobook-(?:\d+\.(?:wav|mp3)|manifest-\d+\.json)$/.test(segments[1]);
  const isChapterOutput = segments.length === 3 && segments[0] === "cache" && segments[1] === bookId &&
    /^[a-zA-Z0-9_-]+-[a-f0-9]{16}\.(?:wav|mp3)$/.test(segments[2]);
  if (!isBookOutput && !isChapterOutput) return reject("path does not match authorized book output");

  return path;
}
