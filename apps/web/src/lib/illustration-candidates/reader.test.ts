import { createHash } from "node:crypto";
import sharp from "sharp";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ client: vi.fn(), admin: vi.fn(), billing: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/lib/billing/server", () => ({ getBillingStateForUser: mocks.billing }));
import { GET } from "@/app/api/reader/books/[id]/editions/[editionId]/chapters/[chapterId]/illustrations/[assetId]/image/route";
import { candidateBaseUrl } from "@/features/illustration-candidates/contracts";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const key = { bookId: id(1), editionId: id(2), chapterId: id(3) };
const ownerId = id(4); const readerId = id(5); const assetId = id(9);
const reference = `${candidateBaseUrl(key)}/${assetId}/image`;
const document = (src = reference) => JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "The harbour." }] }, { type: "image", attrs: { src, alt: "A boat" } }] });
type Row = Record<string, unknown>;

async function fixture() {
  const bytes = await sharp({ create: { width: 8, height: 6, channels: 3, background: "navy" } }).png().toBuffer();
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const path = `${ownerId}/${key.bookId}/illustrations/${key.chapterId}/${assetId}-${sha256}.png`;
  const intentHash = createHash("sha256").update(JSON.stringify([ownerId, key.bookId, key.editionId, key.chapterId, assetId, 4, "A boat", "half-page", "Sea", "Ink", "Blue", sha256])).digest("hex");
  const book: Row = { id: key.bookId, author_id: ownerId, deleted_at: null, status: "PUBLISHED", price_amount: 100, pricing_model: "book_only" };
  const chapter: Row = { id: key.chapterId, book_id: key.bookId, book_version_id: key.editionId, title: "Chapter 2", order: 2, version_number: 4, deleted_at: null, content: document(), source_text: "Fallback." };
  const edition: Row = { id: key.editionId, book_id: key.bookId };
  const asset: Row = { id: assetId, book_id: key.bookId, user_id: ownerId, content_type: "image", channel: "generic", version: 1, status: "completed", visibility: "private", created_at: "2026-09-22T12:00:00.000Z", config: { feature: "chapter_illustration", contractVersion: 1, editionId: key.editionId, chapterId: key.chapterId, sourceChapterVersion: 4, alt: "A boat", placement: "half-page", styleSnapshot: { name: "Sea", medium: "Ink", palette: "Blue" } }, metadata: { source: "manual_upload", bucket: "content-assets", path, sha256, intentHash, mime: "image/png", width: 8, height: 6 } };
  const state = { userId: readerId as string | null, authError: null as { name: string } | null, purchased: true, chapterPurchased: false, subscribed: false, plus: false, preview: false, dbError: "", hiddenTables: [] as string[], afterDownload: () => {}, bytes, book, chapter, edition, asset };
  const calls: unknown[][] = [];
  function from(table: string, privileged = false) {
    const filters: Array<[string, unknown]> = []; let limited: number | undefined;
    function result(single = false) {
      if (state.dbError === table) return { data: null, error: { message: "unavailable" } };
      if (!privileged && state.hiddenTables.includes(table)) return { data: single ? null : [], error: null };
      const tables: Record<string, Row[]> = {
        books: [book], book_versions: [edition], content_assets: [asset],
        chapters: state.preview ? [chapter] : [{ id: id(8), title: "Chapter 1", order: 1, book_version_id: key.editionId }, chapter],
        entitlements: [...(state.purchased ? [{ id: id(10), book_id: key.bookId, user_id: readerId, source: "purchase", chapter_id: null }] : []), ...(state.chapterPurchased ? [{ id: id(11), book_id: key.bookId, user_id: readerId, source: "purchase", chapter_id: key.chapterId }] : [])],
        author_subscriptions: state.subscribed ? [{ id: id(12), subscriber_user_id: readerId, author_id: ownerId, status: "active" }] : [],
      };
      let rows = (tables[table] ?? []).filter((row) => filters.every(([column, value]) => row[column] === value));
      if (limited !== undefined) rows = rows.slice(0, limited);
      return { data: single ? rows[0] ?? null : rows, error: null };
    }
    const query = {
      select() { return query; },
      eq(column: string, value: unknown) { filters.push([column, value]); calls.push([table, column, value]); return query; },
      is(column: string, value: unknown) { return query.eq(column, value); },
      order() { return query; }, limit(value: number) { limited = value; return query; },
      maybeSingle() { return Promise.resolve(result(true)); },
      then(resolve: (value: unknown) => unknown) { return Promise.resolve(result()).then(resolve); },
    };
    return query;
  }
  const getUser = vi.fn(async () => ({ data: { user: state.userId ? { id: state.userId } : null }, error: state.authError }));
  const download = vi.fn(async (requested: string) => { expect(requested).toBe(path); state.afterDownload(); return { data: new Blob([new Uint8Array(state.bytes)]), error: null }; });
  const sessionFrom = vi.fn((table: string) => from(table));
  const adminFrom = vi.fn((table: string) => from(table, true));
  const getBucket = vi.fn(async () => ({ data: { id: "content-assets", public: false }, error: null }));
  const storageFrom = vi.fn(() => ({ download }));
  mocks.client.mockResolvedValue({ from: sessionFrom, auth: { getUser } });
  mocks.admin.mockReturnValue({ from: adminFrom, storage: { getBucket, from: storageFrom } });
  mocks.billing.mockImplementation(async () => ({ ok: true, state: { isPlusActive: state.plus } }));
  return { state, calls, download, getUser, adminFrom, getBucket, storageFrom, request: (params = {}) => GET(new Request("http://localhost/image"), { params: Promise.resolve({ id: key.bookId, editionId: key.editionId, chapterId: key.chapterId, assetId, ...params }) }) };
}

beforeEach(() => { vi.resetAllMocks(); vi.spyOn(console, "error").mockImplementation(() => {}); });
it("serves the embedded private image to a purchaser, with owner binding and no caching", async () => {
  const f = await fixture(); const response = await f.request();
  expect(response.status).toBe(200); expect(Buffer.from(await response.arrayBuffer())).toEqual(f.state.bytes);
  expect(response.headers.get("cache-control")).toBe("private, no-store"); expect(response.headers.get("vary")).toBe("Cookie");
  expect(response.headers.get("content-type")).toBe("image/png"); expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(f.calls).toContainEqual(["content_assets", "user_id", ownerId]); expect(f.getUser.mock.calls.length).toBeGreaterThanOrEqual(2);
});
it.each(["free", "preview", "author", "plus", "chapter purchase", "author subscription"])("matches the reader's %s access", async (kind) => {
  const f = await fixture(); f.state.purchased = false;
  if (kind === "free") { f.state.userId = null; f.state.book.price_amount = 0; }
  if (kind === "preview") { f.state.userId = null; f.state.preview = true; f.state.authError = { name: "AuthSessionMissingError" }; }
  if (kind === "author") { f.state.userId = ownerId; f.state.book.status = "DRAFT"; }
  if (kind === "plus") { f.state.plus = true; f.state.book.status = "DRAFT"; }
  if (kind === "chapter purchase") { f.state.chapterPurchased = true; f.state.book.pricing_model = "per_chapter"; }
  if (kind === "author subscription") f.state.subscribed = true;
  expect((await f.request()).status).toBe(200);
});
it("preserves purchased access when a book is unpublished", async () => {
  const f = await fixture(); f.state.book.status = "DRAFT"; expect((await f.request()).status).toBe(200);
});
it.each(["locked", "unpublished free", "unpublished preview", "invalid session", "foreign chapter purchase"])("denies %s before privileged storage", async (kind) => {
  const f = await fixture(); f.state.purchased = false;
  if (kind === "unpublished free") { f.state.book.status = "DRAFT"; f.state.book.price_amount = 0; }
  if (kind === "unpublished preview") { f.state.book.status = "DRAFT"; f.state.preview = true; }
  if (kind === "invalid session") f.state.authError = { name: "AuthApiError" };
  if (kind === "foreign chapter purchase") f.state.chapterPurchased = true;
  const response = await f.request(); expect(response.status).toBe(404); expect(response.headers.get("cache-control")).toBe("private, no-store"); expect(mocks.admin).not.toHaveBeenCalled();
});
it.each(["chapter book", "chapter edition", "edition book", "deleted chapter", "deleted book", "unreferenced", "other scope reference", "database failure"])("denies %s before privileged storage", async (kind) => {
  const f = await fixture();
  if (kind === "chapter book") f.state.chapter.book_id = id(99);
  if (kind === "chapter edition") f.state.chapter.book_version_id = id(99);
  if (kind === "edition book") f.state.edition.book_id = id(99);
  if (kind === "deleted chapter") f.state.chapter.deleted_at = "2026-09-24";
  if (kind === "deleted book") f.state.book.deleted_at = "2026-09-24";
  if (kind === "unreferenced") f.state.chapter.content = document(`${candidateBaseUrl(key)}/${id(99)}/image`);
  if (kind === "other scope reference") f.state.chapter.content = document(reference.replace(key.editionId, id(99)));
  if (kind === "database failure") f.state.dbError = "chapters";
  expect((await f.request()).status).toBe(kind === "database failure" ? 503 : 404); expect(mocks.admin).not.toHaveBeenCalled();
});
it.each(["entitlement", "identity", "signout", "content", "owner", "publication"])("reauthorizes after download and denies revoked %s", async (kind) => {
  const f = await fixture();
  f.state.afterDownload = () => {
    if (kind === "entitlement") f.state.purchased = false;
    if (kind === "identity") f.state.userId = id(66);
    if (kind === "signout") f.state.userId = null;
    if (kind === "content") f.state.chapter.content = document("https://example.com/other.png");
    if (kind === "owner") f.state.book.author_id = id(66);
    if (kind === "publication") { f.state.book.status = "DRAFT"; f.state.book.price_amount = 0; }
  };
  expect((await f.request()).status).toBe(404); expect(f.download).toHaveBeenCalledTimes(1);
});
it.each(["asset owner", "asset edition", "path", "bytes"])("retains CandidateService integrity checks for %s", async (kind) => {
  const f = await fixture();
  if (kind === "asset owner") f.state.asset.user_id = readerId;
  if (kind === "asset edition") (f.state.asset.config as Row).editionId = id(66);
  if (kind === "path") (f.state.asset.metadata as Row).path = "foreign/private.png";
  if (kind === "bytes") f.state.bytes = Buffer.from("tampered");
  expect((await f.request()).status).toBe(kind === "bytes" ? 503 : 404);
  if (kind !== "bytes") expect(f.download).not.toHaveBeenCalled();
});
it("rejects malformed scope before session or privileged storage", async () => {
  const f = await fixture(); expect((await f.request({ editionId: "bad" })).status).toBe(404); expect(mocks.client).not.toHaveBeenCalled(); expect(mocks.admin).not.toHaveBeenCalled();
});

it("serves image-only structured content that the reader renders", async () => {
  const f = await fixture(); f.state.chapter.content = JSON.stringify({ type: "doc", content: [{ type: "image", attrs: { src: reference } }] });
  expect((await f.request()).status).toBe(200);
});
it("uses source_text only when it is the reader's actual fallback", async () => {
  const f = await fixture(); f.state.chapter.content = null; f.state.chapter.source_text = document();
  expect((await f.request()).status).toBe(200);
  f.state.chapter.content = document("https://example.com/other.png");
  expect((await f.request()).status).toBe(404);
});

it.each([
  ["chapters", "purchase"], ["books", "purchase"], ["book_versions", "purchase"],
  ["chapters", "plus"], ["books", "plus"], ["book_versions", "plus"],
])("respects session RLS hiding %s despite otherwise valid %s access and admin visibility", async (table, entitlement) => {
  const f = await fixture(); f.state.hiddenTables = [table];
  f.state.purchased = entitlement === "purchase"; f.state.plus = entitlement === "plus";
  const hiddenRow = table === "chapters" ? f.state.chapter : table === "books" ? f.state.book : f.state.edition;
  // The privileged fixture genuinely has the row that the cookie session cannot read.
  expect((await f.adminFrom(table).select().eq("id", hiddenRow.id).maybeSingle()).data).toEqual(hiddenRow);
  f.adminFrom.mockClear();
  expect((await f.request()).status).toBe(404);
  expect(mocks.admin).not.toHaveBeenCalled(); expect(f.adminFrom).not.toHaveBeenCalled();
  expect(f.getBucket).not.toHaveBeenCalled(); expect(f.storageFrom).not.toHaveBeenCalled(); expect(f.download).not.toHaveBeenCalled();
});
it("checks session edition visibility again after downloading", async () => {
  const f = await fixture(); f.state.afterDownload = () => { f.state.hiddenTables = ["book_versions"]; };
  expect((await f.request()).status).toBe(404); expect(f.download).toHaveBeenCalledTimes(1);
});
it("does not let a foreign image suppress the reader's source_text fallback", async () => {
  const f = await fixture();
  f.state.chapter.content = JSON.stringify({ type: "doc", content: [{ type: "image", attrs: { src: reference.replace(key.editionId, id(99)) } }] });
  f.state.chapter.source_text = document(); expect((await f.request()).status).toBe(200);
});

it("keeps an inserted image readable after the chapter advances beyond its source version", async () => {
  const f = await fixture(); expect((await f.request()).status).toBe(200);
  f.state.chapter.version_number = 5;
  expect((f.state.asset.config as Row).sourceChapterVersion).toBe(4);
  const response = await f.request(); expect(response.status).toBe(200);
  expect(Buffer.from(await response.arrayBuffer())).toEqual(f.state.bytes);
});
