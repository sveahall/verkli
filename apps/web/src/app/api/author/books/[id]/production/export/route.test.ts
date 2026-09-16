import { beforeEach, describe, expect, it, vi } from "vitest";
import { createProductionSettings } from "@/features/book-production/model";

const mock = vi.hoisted(() => ({ auth: vi.fn(), load: vi.fn(), artwork: vi.fn(), interior: vi.fn(), cover: vi.fn(), limit: vi.fn(), from: vi.fn(), query: vi.fn() }));
vi.mock("@/lib/book-production/server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/book-production/server")>("@/lib/book-production/server");
  return { ...actual, authorizeProductionEdition: mock.auth, loadProductionDraft: mock.load, loadProductionArtwork: mock.artwork };
});
vi.mock("@/features/book-production/pdf", async () => {
  const { PdfValidationError } = await import("@/features/book-production/pdf-error");
  return { PdfValidationError, buildInteriorPdf: mock.interior, buildCoverPdf: mock.cover };
});
vi.mock("@/lib/rate-limit", () => ({ createPerUserRateLimiter: () => ({ check: mock.limit }) }));
const { POST } = await import("./route");
const { ProductionError } = await import("@/lib/book-production/server");
const { PdfValidationError } = await import("@/features/book-production/pdf-error");
const versionId = "00000000-0000-4000-8000-000000000001";
const bookId = "00000000-0000-4000-8000-000000000002";
const query = { select: vi.fn(), eq: vi.fn(), is: vi.fn(), order: vi.fn(), limit: mock.query };
const chapter = { id: "chapter", title: "The ferry", content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Åsa returns." }] }] }, order: 1 };
function request(body: object = { versionId, revision: 1, kind: "interior" }) { return new Request("https://www.verkli.com/api/author/books/book/production/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
const params = { params: Promise.resolve({ id: bookId }) };

describe("private print exports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query); query.is.mockReturnValue(query); query.order.mockReturnValue(query);
    mock.from.mockReturnValue(query); mock.query.mockResolvedValue({ data: [chapter], count: 1, error: null });
    mock.auth.mockResolvedValue({ supabase: { from: mock.from }, bookId, versionId, ownerId: "author" });
    mock.limit.mockResolvedValue({ allowed: true });
    mock.load.mockResolvedValue({ settings: createProductionSettings({ title: "The ferry", author: "Åsa" }), revision: 1 });
    mock.interior.mockResolvedValue({ buffer: Buffer.from("%PDF-test"), pageCount: 8, warnings: ["Review with your printer."] });
    mock.cover.mockResolvedValue({ buffer: Buffer.from("%PDF-cover"), pageCount: 1, warnings: [] });
  });
  it("authorizes the exact edition and exports all saved chapters with private headers", async () => {
    const res = await POST(request(), params);
    expect(res.status).toBe(200);
    expect(mock.auth).toHaveBeenCalledWith(bookId, versionId);
    expect(query.eq).toHaveBeenCalledWith("book_version_id", versionId);
    expect(query.eq).toHaveBeenCalledWith("book_id", bookId);
    expect(query.is).toHaveBeenCalledWith("deleted_at", null);
    expect(mock.interior).toHaveBeenCalledWith(expect.any(Object), [chapter]);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Cache-Control")).toContain("no-store");
    expect(res.headers.get("X-Page-Count")).toBe("8");
    expect(await res.text()).toBe("%PDF-test");
  });
  it("refuses another author's edition before reading chapters or artwork", async () => {
    mock.auth.mockRejectedValue(new ProductionError(404, "NOT_FOUND", "Book edition not found."));
    const res = await POST(request(), params);
    expect(res.status).toBe(404); expect(mock.from).not.toHaveBeenCalled(); expect(mock.interior).not.toHaveBeenCalled();
  });
  it("refuses stale settings before rendering", async () => {
    mock.load.mockResolvedValue({ settings: createProductionSettings(), revision: 2 });
    expect((await POST(request(), params)).status).toBe(409); expect(mock.interior).not.toHaveBeenCalled();
  });
  it("refuses a layout updated during export", async () => {
    mock.load.mockResolvedValueOnce({ settings: createProductionSettings(), revision: 1 }).mockResolvedValueOnce({ settings: createProductionSettings(), revision: 2 });
    expect((await POST(request(), params)).status).toBe(409);
  });
  it("never exports a silently truncated chapter query", async () => {
    mock.query.mockResolvedValue({ data: [chapter], count: 20, error: null });
    expect((await POST(request(), params)).status).toBe(422); expect(mock.interior).not.toHaveBeenCalled();
  });
  it("rejects an interior if a chapter changes while the PDF is rendering", async () => {
    mock.query.mockResolvedValueOnce({ data: [chapter], count: 1, error: null })
      .mockResolvedValueOnce({ data: [{ ...chapter, content: "New saved text" }], count: 1, error: null });
    const res = await POST(request(), params);
    expect(res.status).toBe(409); expect((await res.json()).error).toBe("MANUSCRIPT_CHANGED");
  });
  it("reports missing chapters instead of producing an empty book", async () => {
    mock.query.mockResolvedValue({ data: [], count: 0, error: null });
    expect((await POST(request(), params)).status).toBe(422);
  });
  it("loads both artworks only through the authorized private loader", async () => {
    const settings = createProductionSettings(); settings.cover.frontPath = "owner/book/edition/front.png"; settings.cover.backPath = "owner/book/edition/back.png";
    mock.load.mockResolvedValue({ settings, revision: 1 }); mock.artwork.mockResolvedValue({ buffer: Buffer.from("image"), width: 3000, height: 4000 });
    expect((await POST(request({ versionId, revision: 1, kind: "cover" }), params)).status).toBe(200);
    expect(mock.artwork).toHaveBeenCalledWith(expect.objectContaining({ bookId, versionId }), settings.cover.frontPath, "front");
    expect(mock.artwork).toHaveBeenCalledWith(expect.objectContaining({ bookId, versionId }), settings.cover.backPath, "back");
    expect(mock.interior).not.toHaveBeenCalled();
  });
  it("returns actionable preflight errors, without leaking internal exceptions", async () => {
    mock.interior.mockRejectedValue(new PdfValidationError("This manuscript contains an unsupported table."));
    const res = await POST(request(), params); expect(res.status).toBe(422); expect((await res.json()).message).toContain("unsupported table");
  });
  it("bounds the request body even without a Content-Length header", async () => {
    const res = await POST(request({ versionId, revision: 1, kind: "interior", extra: "x".repeat(3000) }), params);
    expect(res.status).toBe(413); expect(mock.auth).not.toHaveBeenCalled();
  });
  it("rate limits before manuscript loading", async () => {
    mock.limit.mockResolvedValue({ allowed: false }); expect((await POST(request(), params)).status).toBe(429); expect(mock.from).not.toHaveBeenCalled();
  });
});
