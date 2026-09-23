import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrivateExportError, privateContentHash } from "@/lib/audiobook/private-export-contract";
const mock = vi.hoisted(() => ({ authorize: vi.fn(), snapshot: vi.fn(), readObject: vi.fn(), rateLimit: vi.fn() }));
vi.mock("@/lib/audiobook/private-export-supabase", () => ({ createPrivateExportDependencies: () => mock }));
import { GET, POST, runtime, maxDuration } from "./route";
const owner = "11111111-1111-4111-8111-111111111111", book = "22222222-2222-4222-8222-222222222222", edition = "33333333-3333-4333-8333-333333333333", chapter = "44444444-4444-4444-8444-444444444444";
const context = { params: Promise.resolve({ id: book }) };
const url = `http://localhost/api/author/books/${book}/audiobook/export`;
const input = { editionId: edition, format: "mp3-128", snapshotId: "a".repeat(64) };
beforeEach(() => { vi.clearAllMocks(); mock.authorize.mockResolvedValue(owner); mock.rateLimit.mockResolvedValue(true); });
describe("private audio export route", () => {
  it("uses the bounded node runtime", () => { expect(runtime).toBe("nodejs"); expect(maxDuration).toBe(120); });
  it.each(["GET", "POST"])("%s denies unauthenticated sessions without metadata or storage reads", async (method) => {
    mock.authorize.mockRejectedValue(new PrivateExportError(401, "AUTHOR_AUTH_REQUIRED", "Sign in."));
    const response = method === "GET" ? await GET(new Request(`${url}?editionId=${edition}`), context) : await POST(new Request(url, { method, body: JSON.stringify(input) }), context);
    expect(response.status).toBe(401); expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Content-Disposition")).toBeNull(); expect(mock.snapshot).not.toHaveBeenCalled(); expect(mock.readObject).not.toHaveBeenCalled();
  });
  it("rejects path and URL inputs before reaching the adapter", async () => {
    const post = await POST(new Request(url, { method: "POST", body: JSON.stringify({ ...input, path: "https://attacker.invalid/private.mp3" }) }), context);
    const get = await GET(new Request(`${url}?editionId=${edition}&url=https://attacker.invalid`), context);
    expect(post.status).toBe(400); expect(get.status).toBe(400); expect(mock.authorize).not.toHaveBeenCalled(); expect(mock.readObject).not.toHaveBeenCalled();
  });
  it("rejects a foreign edition with no download response", async () => {
    mock.snapshot.mockRejectedValue(new PrivateExportError(404, "EDITION_NOT_FOUND", "This edition is not available in your account."));
    const response = await POST(new Request(url, { method: "POST", body: JSON.stringify(input) }), context);
    expect(response.status).toBe(404); expect(response.headers.get("Content-Disposition")).toBeNull(); expect(mock.readObject).not.toHaveBeenCalled();
  });
  it("previews current metadata without returning private paths, voice IDs or bytes", async () => {
    mock.snapshot.mockResolvedValue({ ownerId: owner, book: { id: book, authorId: owner, title: "Book", deletedAt: null, demoRunId: null }, edition: { id: edition, bookId: book, language: "en", demoRunId: null }, authorName: "Author", asset: { id: owner, bookId: book, language: "en", status: "generated", isSmoke: false, demoRunId: null }, chapterCount: 1,
      chapters: [{ id: chapter, bookId: book, editionId: edition, order: 0, title: "Chapter", text: "Narration", cache: { id: owner, chapterId: chapter, editionId: edition, contentHash: privateContentHash("Narration", chapter, edition), voiceId: "private-voice", modelId: "private-model", language: "en", path: `cache/${book}/${chapter}-0123456789abcdef.mp3`, bytes: 3 } }] });
    const response = await GET(new Request(`${url}?editionId=${edition}`), context); const result = await response.json();
    expect(response.status).toBe(200); expect(result.metadata.title).toBe("Book"); expect(result.snapshotId).toMatch(/^[a-f0-9]{64}$/);
    expect(result.chapters).toEqual([{ id: chapter, title: "Chapter" }]); expect(JSON.stringify(result)).not.toContain("private-voice"); expect(JSON.stringify(result)).not.toContain("cache/"); expect(mock.readObject).not.toHaveBeenCalled();
  });
});
