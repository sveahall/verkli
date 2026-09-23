import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { createProductionSettings } from "@/features/book-production/model";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), client: vi.fn(), rate: vi.fn() }));
vi.mock("@/lib/auth/require-author", () => ({ requireAuthorRoleForApi: mocks.auth }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/lib/rate-limit", () => ({ createPerUserRateLimiter: () => ({ check: mocks.rate }) }));

const { GET, PUT } = await import("./route");
const { POST } = await import("./artwork/route");
const { authorizeProductionEdition, loadProductionArtwork, readProductionJson } = await import("@/lib/book-production/server");
const ownerId = "10000000-0000-4000-8000-000000000001";
const bookId = "20000000-0000-4000-8000-000000000002";
const versionId = "30000000-0000-4000-8000-000000000003";
const otherId = "40000000-0000-4000-8000-000000000004";
const frontPath = `${ownerId}/${bookId}/${versionId}/front-${otherId}.png`;
const url = `http://localhost/api/author/books/${bookId}/production?versionId=${versionId}`;
const params = { params: Promise.resolve({ id: bookId }) };
type Draft = { book_id: string; version_id: string; owner_id: string; settings: unknown; revision: number };

function fixture(options: { bookOwner?: string; versionBook?: string; databaseError?: string; draftError?: string; draft?: Draft | null; insertConflict?: boolean } = {}) {
  let draft = options.draft ?? null;
  const queries: Array<{ table: string; operation: string; filters: Record<string, unknown>; value?: Draft }> = [];
  const files = new Map<string, Buffer>();
  const storage = {
    download: vi.fn(async (path: string) => ({ data: files.has(path) ? new Blob([new Uint8Array(files.get(path)!)]) : null, error: files.has(path) ? null : { message: "Object missing" } })),
    upload: vi.fn(async (path: string, data: Buffer) => { files.set(path, data); return { data: { path }, error: null }; }),
    createSignedUrl: vi.fn(async (path: string) => ({ data: { signedUrl: `https://storage.example/signed/${path}` }, error: null })),
  };
  const client = {
    from: (table: string) => {
      const call = { table, operation: "select", filters: {} as Record<string, unknown>, value: undefined as Draft | undefined };
      queries.push(call);
      const query = {
        select: () => query,
        eq: (key: string, value: unknown) => { call.filters[key] = value; return query; },
        insert: (value: Draft) => { call.operation = "insert"; call.value = value; return query; },
        update: (value: Draft) => { call.operation = "update"; call.value = value; return query; },
        maybeSingle: async () => {
          if (options.databaseError) return { data: null, error: { code: options.databaseError, message: "database unavailable" } };
          if (table === "book_production_drafts" && options.draftError) return { data: null, error: { code: options.draftError, message: "database unavailable" } };
          if (table === "books") return { data: { id: bookId, author_id: options.bookOwner ?? ownerId, title: "A private edition", deleted_at: null }, error: null };
          if (table === "book_versions") return { data: options.versionBook && options.versionBook !== call.filters.book_id ? null : { id: versionId, book_id: options.versionBook ?? bookId, language_code: "en" }, error: null };
          if (call.operation === "insert") {
            if (draft || options.insertConflict) return { data: null, error: { code: "23505" } };
            draft = call.value!;
            return { data: draft, error: null };
          }
          if (call.operation === "update") {
            if (!draft || draft.revision !== call.filters.revision) return { data: null, error: null };
            draft = { ...draft, ...call.value };
            return { data: draft, error: null };
          }
          return { data: draft, error: null };
        },
      };
      return query;
    },
    storage: { from: vi.fn(() => storage) },
  };
  mocks.client.mockResolvedValue(client);
  return { queries, files, storage, client, get draft() { return draft; } };
}

function put(settings = createProductionSettings(), revision = 0, extra: Record<string, unknown> = {}) {
  return PUT(new Request(url, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ versionId, settings, revision, ...extra }) }), params);
}

async function image() {
  return sharp({ create: { width: 40, height: 60, channels: 3, background: "#8c7b65" } }).png().toBuffer();
}

async function upload(buffer: Buffer, type = "image/png", side = "front") {
  const form = new FormData();
  form.set("file", new File([new Uint8Array(buffer)], "untrusted-name.svg", { type }));
  form.set("side", side);
  return POST(new Request(url.replace("/production?", "/production/artwork?"), { method: "POST", body: form }), params);
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.auth.mockResolvedValue({ user: { id: ownerId }, response: null });
  mocks.rate.mockResolvedValue({ allowed: true });
  fixture();
});
afterEach(() => vi.restoreAllMocks());

describe("private edition draft routes", () => {
  it("returns an explicit empty state without creating a row", async () => {
    const f = fixture();
    const response = await GET(new Request(url), params);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({ settings: null, revision: 0, artwork: {} });
    expect(f.queries.find((query) => query.table === "book_versions")?.filters).toEqual({ id: versionId, book_id: bookId });
    expect(f.queries.find((query) => query.table === "book_production_drafts")?.filters).toEqual({ book_id: bookId, version_id: versionId, owner_id: ownerId });
    expect(f.queries.some((query) => query.operation !== "select")).toBe(false);
  });

  it("derives identity from the session and saves a private draft with compare-and-swap", async () => {
    const f = fixture();
    const settings = createProductionSettings();
    settings.sections.push({ id: "foreword-1", kind: "foreword", title: "Foreword", body: "Unpublished private text", placement: "before", enabled: true, startRecto: true });
    expect(await (await put(settings)).json()).toEqual({ settings, revision: 1 });
    expect(f.draft).toMatchObject({ owner_id: ownerId, book_id: bookId, version_id: versionId, revision: 1 });
    const next = { ...settings, title: "Revised title" };
    expect(await (await put(next, 1)).json()).toEqual({ settings: next, revision: 2 });
    expect(f.queries.find((query) => query.operation === "update")?.filters).toEqual({ book_id: bookId, version_id: versionId, owner_id: ownerId, revision: 1 });
    expect(f.queries.some((query) => query.table === "books" && query.operation !== "select")).toBe(false);
  });

  it("rejects stale and competing first saves without overwriting the winner", async () => {
    const f = fixture();
    const settings = createProductionSettings({ title: "Winner" });
    expect((await put(settings)).status).toBe(200);
    expect((await put({ ...settings, title: "Stale" }, 0)).status).toBe(409);
    expect((await put({ ...settings, title: "Stale" }, 7)).status).toBe(409);
    expect(f.draft?.settings).toEqual(settings);
    fixture({ insertConflict: true });
    expect((await put()).status).toBe(409);
  });

  it("blocks unauthenticated users and foreign books or editions before private storage", async () => {
    const f = fixture();
    mocks.auth.mockResolvedValueOnce({ user: null, response: new Response(null, { status: 401 }) });
    expect((await GET(new Request(url), params)).status).toBe(401);
    expect(f.queries).toHaveLength(0);
    fixture({ bookOwner: otherId });
    expect((await put()).status).toBe(404);
    const foreign = fixture({ versionBook: otherId });
    expect((await GET(new Request(url), params)).status).toBe(404);
    expect(foreign.queries.some((query) => query.table === "book_production_drafts")).toBe(false);
    expect(foreign.storage.download).not.toHaveBeenCalled();
  });

  it("rejects invalid scope, identity injection, invalid settings and oversized JSON", async () => {
    expect((await GET(new Request(url.replace(versionId, "not-a-uuid")), params)).status).toBe(400);
    expect((await put(createProductionSettings(), 0, { ownerId: otherId })).status).toBe(400);
    expect((await put(createProductionSettings(), 0, { versionId: otherId })).status).toBe(400);
    expect((await put({ ...createProductionSettings(), trimWidthMm: 1 })).status).toBe(400);
    const tooLarge = new Request(url, { method: "PUT", body: "x".repeat(600_000) });
    expect((await PUT(tooLarge, params)).status).toBe(413);
    expect((await PUT(new Request(url, { method: "PUT", body: "{" }), params)).status).toBe(400);
  });

  it("does not silently discard corrupt stored drafts or hide a missing migration", async () => {
    fixture({ draft: { book_id: bookId, version_id: versionId, owner_id: ownerId, revision: 1, settings: { schemaVersion: 99 } } });
    expect((await GET(new Request(url), params)).status).toBe(500);
    fixture({ draftError: "42P01" });
    const unavailable = await GET(new Request(url), params);
    expect(unavailable.status).toBe(503);
    const message = JSON.stringify(await unavailable.json());
    expect(message).not.toContain("database unavailable");
    expect(message).not.toMatch(/migration|schema|supabase/i);
  });

  it("enforces the streamed byte limit when the content-length header understates the body", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode("x".repeat(20))); controller.enqueue(new TextEncoder().encode("x".repeat(20))); },
      cancel,
    });
    const request = new Request(url, { method: "PUT", headers: { "content-length": "1" }, body, duplex: "half" } as RequestInit);
    await expect(readProductionJson(request, 32)).rejects.toMatchObject({ status: 413 });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("rejects foreign, cross-edition, wrong-side and preview artwork paths without downloading", async () => {
    const f = fixture();
    for (const path of [frontPath.replace(ownerId, otherId), frontPath.replace(versionId, otherId), frontPath.replace("front-", "back-"), `preview/front-${otherId}.jpg`]) {
      const settings = createProductionSettings();
      settings.cover.frontPath = path;
      expect((await put(settings)).status).toBe(400);
    }
    expect(f.storage.download).not.toHaveBeenCalled();
    expect(f.storage.createSignedUrl).not.toHaveBeenCalled();
  });

  it("loads only owned edition artwork and signs private previews for 15 minutes", async () => {
    const settings = createProductionSettings();
    settings.cover.frontPath = frontPath;
    const f = fixture({ draft: { book_id: bookId, version_id: versionId, owner_id: ownerId, settings, revision: 4 } });
    f.files.set(frontPath, await image());
    const response = await GET(new Request(url), params);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ settings, revision: 4, artwork: { front: { path: frontPath, url: `https://storage.example/signed/${frontPath}`, width: 40, height: 60 } } });
    expect(f.client.storage.from).toHaveBeenCalledWith("print-artwork");
    expect(f.storage.createSignedUrl).toHaveBeenCalledWith(frontPath, 900);
    const context = await authorizeProductionEdition(bookId, versionId);
    const result = await loadProductionArtwork(context, frontPath, "front");
    expect(result).toMatchObject({ width: 40, height: 60, format: "png" });
    expect(Buffer.isBuffer(result.buffer)).toBe(true);
  });
});

describe("private print artwork uploads", () => {
  it("limits repeated uploads before reading or storing their image data", async () => {
    const f = fixture();
    mocks.rate.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 42 });
    const response = await upload(await image());
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("42");
    expect(mocks.rate).toHaveBeenCalledWith(ownerId);
    expect(f.storage.upload).not.toHaveBeenCalled();
  });

  it.each([1, 2, 3, 4, 5, 6, 7, 8])("keeps original PDF pixels while exposing orientation %s correctly in previews", async (orientation) => {
    const f = fixture();
    const source = await sharp({ create: { width: 40, height: 60, channels: 3, background: "#8c7b65" } }).jpeg({ quality: 95 }).withMetadata({ orientation }).toBuffer();
    const response = await upload(source, "image/jpeg");
    expect(response.status).toBe(200);
    const artwork = await response.json();
    const displayWidth = orientation >= 5 ? 60 : 40;
    const displayHeight = orientation >= 5 ? 40 : 60;
    expect(artwork).toMatchObject({ width: displayWidth, height: displayHeight });
    expect(f.files.get(artwork.path)?.equals(source)).toBe(true);
    const loaded = await loadProductionArtwork(await authorizeProductionEdition(bookId, versionId), artwork.path, "front");
    expect(loaded.buffer.equals(source)).toBe(true);
    expect(loaded).toMatchObject({ width: 40, height: 60, displayWidth, displayHeight });
    expect(await sharp(loaded.buffer).metadata()).toMatchObject({ width: 40, height: 60, orientation });
    const settings = createProductionSettings();
    settings.cover.frontPath = artwork.path;
    expect((await put(settings)).status).toBe(200);
    const saved = await (await GET(new Request(url), params)).json();
    expect(saved.artwork.front).toMatchObject({ path: artwork.path, width: displayWidth, height: displayHeight });
  });

  it("decodes artwork, derives its extension and returns the existing cover contract", async () => {
    const f = fixture();
    const response = await upload(await image());
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result).toMatchObject({ width: 40, height: 60 });
    expect(result.path).toMatch(new RegExp(`^${ownerId}/${bookId}/${versionId}/front-[0-9a-f-]{36}\\.png$`));
    expect(result.url).toBe(`https://storage.example/signed/${result.path}`);
    expect(f.storage.upload).toHaveBeenCalledWith(result.path, expect.any(Buffer), expect.objectContaining({ contentType: "image/png", upsert: false }));
    expect(f.queries.some((query) => query.table === "books" && query.operation !== "select")).toBe(false);
  });

  it("rejects a foreign edition before image processing or storage writes", async () => {
    const f = fixture({ versionBook: otherId });
    expect((await upload(await image())).status).toBe(404);
    expect(f.storage.upload).not.toHaveBeenCalled();
  });

  it("rejects unsupported, corrupt, mislabeled, and oversized images", async () => {
    const f = fixture();
    expect((await upload(Buffer.from("<svg></svg>"), "image/svg+xml")).status).toBe(400);
    expect((await upload(Buffer.from("<svg></svg>"), "image/png")).status).toBe(400);
    expect((await upload(await image(), "image/jpeg")).status).toBe(400);
    expect((await upload(await image(), "image/png", "spine")).status).toBe(400);
    const tooWide = await sharp({ create: { width: 20001, height: 1, channels: 3, background: "white" } }).png().toBuffer();
    expect((await upload(tooWide)).status).toBe(400);
    const oversized = new Request(url.replace("/production?", "/production/artwork?"), { method: "POST", headers: { "content-length": String(22 * 1024 * 1024) }, body: "" });
    expect((await POST(oversized, params)).status).toBe(413);
    expect(f.storage.upload).not.toHaveBeenCalled();
  });

  it("rejects truncated image data that contains an otherwise valid PNG header", async () => {
    const f = fixture();
    const source = await image();
    expect((await upload(source.subarray(0, 60))).status).toBe(400);
    expect(f.storage.upload).not.toHaveBeenCalled();
  });

  it("refuses missing files and unsigned storage failures without reporting success", async () => {
    const form = new FormData();
    form.set("side", "front");
    expect((await POST(new Request(url, { method: "POST", body: form }), params)).status).toBe(400);
    const f = fixture();
    f.storage.createSignedUrl.mockResolvedValueOnce({ data: null as never, error: { message: "sensitive provider detail" } as never });
    const response = await upload(await image());
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("sensitive provider detail");
  });
});
