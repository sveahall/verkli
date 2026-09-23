import { beforeEach, describe, expect, it, vi } from "vitest";
import { privateContentHash } from "./private-export-contract";
const mock = vi.hoisted(() => ({ auth: vi.fn(), client: vi.fn(), admin: vi.fn(), download: vi.fn(), bucket: vi.fn(), limit: vi.fn(), rate: vi.fn() }));
vi.mock("@/lib/auth/require-author", () => ({ requireAuthorRoleForApi: mock.auth }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mock.client }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mock.admin }));
vi.mock("@/lib/tts/storage", () => ({ getAudiobookStorageBucket: mock.bucket }));
vi.mock("@/lib/rate-limit", () => ({ createPerUserRateLimiter: mock.rate.mockReturnValue({ check: mock.limit }) }));
import { createPrivateExportDependencies } from "./private-export-supabase";
const owner = "11111111-1111-4111-8111-111111111111", book = "22222222-2222-4222-8222-222222222222", edition = "33333333-3333-4333-8333-333333333333", chapter = "44444444-4444-4444-8444-444444444444";
const path = `cache/${book}/${chapter}-0123456789abcdef.mp3`;
const signal = new AbortController().signal;
const queries: { table: string; calls: [string, ...unknown[]][] }[] = [];
let results: { data: unknown; error: unknown; count?: number }[];
function setupQueries() {
  mock.client.mockResolvedValue({ from(table: string) {
    const record = { table, calls: [] as [string, ...unknown[]][] }; queries.push(record);
    const result = results.shift();
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "is", "order", "limit", "abortSignal", "maybeSingle"])
      chain[method] = (...args: unknown[]) => { record.calls.push([method, ...args]); return chain; };
    chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
    return chain;
  } });
}
beforeEach(() => {
  vi.clearAllMocks(); queries.length = 0;
  mock.auth.mockResolvedValue({ user: { id: owner }, response: null });
  mock.bucket.mockReturnValue("private-audiobooks"); mock.limit.mockResolvedValue({ allowed: true });
  mock.admin.mockReturnValue({ storage: { from: vi.fn(() => ({ download: mock.download })) } });
  results = [
    { data: { id: book, author_id: owner, title: "Existing book", deleted_at: null, demo_run_id: null }, error: null },
    { data: { id: edition, book_id: book, language_code: "en", demo_run_id: null }, error: null },
    { data: { display_name: "Author" }, error: null },
    { data: { id: "55555555-5555-4555-8555-555555555555", book_id: book, language: "en", status: "generated", is_smoke: false, demo_run_id: null }, error: null },
    { data: [{ id: chapter, book_id: book, book_version_id: edition, order: 0, title: "Chapter", content: "Existing text", deleted_at: null }], error: null, count: 1 },
    { data: { id: "66666666-6666-4666-8666-666666666666", chapter_id: chapter, book_version_id: edition, content_hash: privateContentHash("Existing text", chapter, edition), language: "en", voice_id: "v", model_path: "m", audio_path: path, file_size_bytes: 3 }, error: null },
  ]; setupQueries();
});
describe("private export Supabase boundaries", () => {
  it("creates no client or credentials until use and denies unauthenticated authors before reads", async () => {
    const deps = createPrivateExportDependencies(); expect(mock.client).not.toHaveBeenCalled(); expect(mock.admin).not.toHaveBeenCalled();
    mock.auth.mockResolvedValue({ user: null, response: new Response(null, { status: 401 }) });
    await expect(deps.authorize(signal)).rejects.toMatchObject({ status: 401 });
    expect(mock.client).not.toHaveBeenCalled(); expect(mock.admin).not.toHaveBeenCalled();
  });
  it("selects only exact owned edition, complete chapters and exact newest cache with abort on every query", async () => {
    const deps = createPrivateExportDependencies(); expect(await deps.authorize(signal)).toBe(owner);
    const snapshot = await deps.snapshot(owner, book, edition, signal);
    expect(snapshot).toMatchObject({ ownerId: owner, chapterCount: 1, chapters: [{ text: "Existing text", cache: { path, modelId: "m", bytes: 3 } }] });
    expect(queries.map(q => q.table)).toEqual(["books", "book_versions", "profiles", "audiobook_assets", "chapters", "chapter_audio_cache"]);
    expect(queries[0].calls).toContainEqual(["eq", "author_id", owner]);
    expect(queries[1].calls).toContainEqual(["eq", "book_id", book]);
    expect(queries[3].calls).toContainEqual(["eq", "is_smoke", false]);
    expect(queries[4].calls).toContainEqual(["select", expect.any(String), { count: "exact" }]);
    expect(queries[4].calls).toContainEqual(["limit", 20]);
    expect(queries[5].calls).toEqual(expect.arrayContaining([["eq", "chapter_id", chapter], ["eq", "book_version_id", edition], ["eq", "content_hash", privateContentHash("Existing text", chapter, edition)], ["eq", "language", "en"], ["order", "created_at", { ascending: false }], ["order", "id", { ascending: false }], ["limit", 1]]));
    for (const query of queries) expect(query.calls).toContainEqual(["abortSignal", signal]);
    expect(mock.admin).not.toHaveBeenCalled();
    expect(await deps.rateLimit?.(owner)).toBe(true); expect(mock.limit).toHaveBeenCalledWith(owner);
  });
  it.each(["owner", "edition", "book-demo", "edition-demo", "smoke", "asset-demo", "incomplete", "cache-edition"])("rejects %s before any storage", async (failure) => {
    const data = (index: number) => results[index].data as Record<string, unknown>;
    if (failure === "owner") data(0).author_id = edition;
    if (failure === "edition") data(1).book_id = edition;
    if (failure === "book-demo") data(0).demo_run_id = "demo";
    if (failure === "edition-demo") data(1).demo_run_id = "demo";
    if (failure === "smoke") data(3).is_smoke = true;
    if (failure === "asset-demo") data(3).demo_run_id = "demo";
    if (failure === "incomplete") results[4].count = 2;
    if (failure === "cache-edition") data(5).book_version_id = book;
    await expect(createPrivateExportDependencies().snapshot(owner, book, edition, signal)).rejects.toMatchObject({ name: "PrivateExportError" });
    expect(mock.admin).not.toHaveBeenCalled();
  });
  it("sanitizes database errors instead of returning SQL details", async () => {
    results[0] = { data: null, error: { message: "secret path SQL credential" } };
    await expect(createPrivateExportDependencies().snapshot(owner, book, edition, signal)).rejects.toThrow("Could not verify existing audio");
  });
  it("streams from the fixed bucket with redirects disabled and bounded bytes", async () => {
    const cancel = vi.fn(); const stream = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array([1, 2, 3])); c.close(); }, cancel });
    mock.download.mockReturnValue({ asStream: () => Promise.resolve({ data: stream, error: null }) });
    expect(await createPrivateExportDependencies().readObject(path, 3, signal)).toEqual(Buffer.from([1, 2, 3]));
    expect(mock.download).toHaveBeenCalledWith(path, {}, { signal, cache: "no-store", redirect: "error" });
    expect(mock.bucket).toHaveBeenCalled(); expect(stream.locked).toBe(false);
  });
  it("cancels an oversized response and releases its reader", async () => {
    const cancel = vi.fn(); const stream = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array(4)); }, cancel });
    mock.download.mockReturnValue({ asStream: () => Promise.resolve({ data: stream, error: null }) });
    await expect(createPrivateExportDependencies().readObject(path, 3, signal)).rejects.toMatchObject({ code: "SOURCE_TOO_LARGE" });
    expect(cancel).toHaveBeenCalled(); expect(stream.locked).toBe(false);
  });
  it("aborts a stalled reader and releases it", async () => {
    const controller = new AbortController(), cancel = vi.fn(); const stream = new ReadableStream<Uint8Array>({ cancel });
    mock.download.mockReturnValue({ asStream: () => Promise.resolve({ data: stream, error: null }) });
    const promise = createPrivateExportDependencies().readObject(path, 3, controller.signal);
    await vi.waitFor(() => expect(stream.locked).toBe(true)); controller.abort();
    await expect(promise).rejects.toMatchObject({ name: "AbortError" }); expect(cancel).toHaveBeenCalled(); expect(stream.locked).toBe(false);
  });
  it("cleans a stream when cancellation races with the download response", async () => {
    const controller = new AbortController(), cancel = vi.fn(); const stream = new ReadableStream<Uint8Array>({ cancel });
    mock.download.mockReturnValue({ asStream: async () => { controller.abort(); return { data: stream, error: null }; } });
    await expect(createPrivateExportDependencies().readObject(path, 3, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(cancel).toHaveBeenCalled(); expect(stream.locked).toBe(false);
  });
  it("never exposes storage error details or creates a client for a pre-cancelled request", async () => {
    mock.download.mockReturnValue({ asStream: async () => { throw new Error("private bucket credential URL"); } });
    await expect(createPrivateExportDependencies().readObject(path, 3, signal)).rejects.toThrow("Could not read verified existing audio");
    mock.admin.mockClear(); const controller = new AbortController(); controller.abort();
    await expect(createPrivateExportDependencies().readObject(path, 3, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(mock.admin).not.toHaveBeenCalled();
  });
  it.each(["https://attacker.invalid/a.mp3", "cache/../../secret", `${path}?url=secret`])("rejects noncanonical path %s before storage", async (invalid) => {
    await expect(createPrivateExportDependencies().readObject(invalid, 3, signal)).rejects.toMatchObject({ code: "SOURCE_UNVERIFIED" }); expect(mock.admin).not.toHaveBeenCalled();
  });
});
