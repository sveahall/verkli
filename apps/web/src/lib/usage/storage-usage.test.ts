import { describe, it, expect } from "vitest";
import { BUCKET_OWNER_KIND, summarizeFiles, type StoredFile } from "./storage-usage";

const f = (path: string, size: number | null): StoredFile => ({ path, size });

describe("summarizeFiles", () => {
  const ownerOf = (path: string) => {
    const head = path.split("/")[0];
    return head.startsWith("user-") ? head : null;
  };

  it("sums bytes per owning user", () => {
    const out = summarizeFiles(
      [f("user-1/a.mp3", 100), f("user-1/b.mp3", 250), f("user-2/c.mp3", 400)],
      ownerOf
    );
    expect(out.byOwner.get("user-1")).toBe(350);
    expect(out.byOwner.get("user-2")).toBe(400);
  });

  it("counts unattributable files instead of discarding them", () => {
    // `audiobooks/cache`, `tts_previews/refs` and `book-downloads/ta-for-er`
    // belong to no one. Dropping them would make the bucket total silently
    // disagree with the invoice.
    const out = summarizeFiles([f("cache/shared.mp3", 900), f("user-1/a.mp3", 100)], ownerOf);
    expect(out.byOwner.get("user-1")).toBe(100);
    expect(out.unattributedBytes).toBe(900);
  });

  it("skips a file with unknown size rather than counting it as zero bytes", () => {
    // A silent zero looks like a user who stores nothing, which is the one
    // answer that must not be wrong when this drives pricing.
    const out = summarizeFiles([f("user-1/a.mp3", null)], ownerOf);
    expect(out.byOwner.has("user-1")).toBe(false);
    expect(out.unknownSizeCount).toBe(1);
  });

  it("reports a total that equals attributed plus unattributed", () => {
    const out = summarizeFiles(
      [f("user-1/a", 100), f("user-2/b", 200), f("cache/c", 700)],
      ownerOf
    );
    const attributed = [...out.byOwner.values()].reduce((n, v) => n + v, 0);
    expect(attributed + out.unattributedBytes).toBe(out.totalBytes);
    expect(out.totalBytes).toBe(1000);
  });
});

describe("BUCKET_OWNER_KIND", () => {
  it("knows audiobooks are keyed by book, not by user", () => {
    // Verified against production: audiobooks/<uuid> is a book id, while
    // book_covers/<uuid> is a user id. Treating them alike would bill one
    // author's audiobooks to whoever happens to share that uuid space.
    expect(BUCKET_OWNER_KIND.audiobooks).toBe("book");
    expect(BUCKET_OWNER_KIND.book_covers).toBe("user");
    expect(BUCKET_OWNER_KIND.avatars).toBe("user");
  });

  it("covers every bucket that exists in production", () => {
    for (const bucket of [
      "chapter-media", "avatars", "book_covers", "audiobooks", "tts_previews",
      "marketing-media", "book-imports", "tts-outputs", "content-assets",
      "book-downloads", "print-artwork",
    ]) {
      expect(BUCKET_OWNER_KIND[bucket], `missing bucket: ${bucket}`).toBeDefined();
    }
  });
});
