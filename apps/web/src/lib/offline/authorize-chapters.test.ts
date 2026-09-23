import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
import { authorizeOfflineChapters, type OfflineChapterAccessRequest } from "./authorize-chapters";

const now = Date.parse("2026-09-23T12:00:00Z");
const policyEnd = now + 60_000;
const request = (): OfflineChapterAccessRequest => ({ bookId: "book", editionId: "edition", chapterIds: ["chapter-a"], ownerUserId: "reader", policy: { expiresAt: policyEnd } });
let rows: Record<string, Record<string, unknown>[]>;
let failedTable: string | null;
let authUser: string | null;
let authError: boolean;
let queries: { table: string; columns: string; filters: [string, unknown][] }[];

function database() {
  return {
    auth: { getUser: async () => ({ data: { user: authUser ? { id: authUser } : null }, error: authError ? { message: "Auth unavailable" } : null }) },
    from: (table: string) => {
      const query = { table, columns: "", filters: [] as [string, unknown][] };
      queries.push(query);
      const predicates: ((row: Record<string, unknown>) => boolean)[] = [];
      const result = () => ({ data: failedTable === table ? null : (rows[table] ?? []).filter((row) => predicates.every((test) => test(row))), error: failedTable === table ? { message: "Database unavailable" } : null });
      const chain = {
        select: (columns: string) => { query.columns = columns; return chain; },
        eq: (key: string, value: unknown) => { query.filters.push([key, value]); predicates.push((row) => row[key] === value); return chain; },
        is: (key: string, value: unknown) => { query.filters.push([key, value]); predicates.push((row) => row[key] === value); return chain; },
        in: (key: string, values: unknown[]) => { query.filters.push([key, values]); predicates.push((row) => values.includes(row[key])); return chain; },
        maybeSingle: async () => { const res = result(); return { ...res, data: res.data?.[0] ?? null }; },
        then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve),
      };
      return chain;
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(now); vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  failedTable = null; authUser = "reader"; authError = false; queries = [];
  rows = {
    books: [{ id: "book", author_id: "author", status: "PUBLISHED", price_amount: 100, pricing_model: "per_chapter" }],
    book_versions: [{ id: "edition", book_id: "book", published_at: "2026-09-01T00:00:00Z", published_chapter_count: 2, visibility: "public" }],
    chapters: [{ id: "chapter-a", book_id: "book", book_version_id: "edition", order: 0, deleted_at: null }, { id: "chapter-b", book_id: "book", book_version_id: "edition", order: 1, deleted_at: null }],
    entitlements: [{ id: "purchase-a", user_id: "reader", book_id: "book", chapter_id: "chapter-a", source: "purchase" }],
    author_subscriptions: [],
    billing_accounts: [],
    author_followers: [],
  };
  mocks.createClient.mockResolvedValue(database());
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("dormant offline chapter authorization", () => {
  it("verifies a permanent chapter purchase but limits the lease to explicit policy", async () => {
    expect(await authorizeOfflineChapters(request())).toEqual({ ok: true, userId: "reader", bookId: "book", editionId: "edition", expiresAt: policyEnd, grants: [{ chapterId: "chapter-a", source: "chapter_purchase", entitlementId: "purchase-a", rightExpiresAt: null }] });
    expect(queries.find((query) => query.table === "chapters")?.filters).toEqual(expect.arrayContaining([["book_id", "book"], ["book_version_id", "edition"], ["id", ["chapter-a"]]]));
    expect(queries.every((query) => !query.columns.includes("content"))).toBe(true);
    expect(queries.some((query) => query.table === "billing_accounts")).toBe(false);
  });

  it.each([null, { expiresAt: now }, { expiresAt: NaN }])("denies missing or invalid policy %j before auth", async (policy) => {
    expect(await authorizeOfflineChapters({ ...request(), policy })).toEqual({ ok: false, reason: "invalid_request" });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it.each([null, "another-reader"])("denies an unverified owner %s", async (ownerUserId) => {
    expect((await authorizeOfflineChapters({ ...request(), ownerUserId })).ok).toBe(false);
    expect(queries).toHaveLength(0);
  });

  it.each(["signed_out", "auth_error"])("does not reuse a previous owner after %s", async (failure) => {
    if (failure === "signed_out") authUser = null; else authError = true;
    expect((await authorizeOfflineChapters(request())).ok).toBe(false);
    expect(queries).toHaveLength(0);
  });

  it("rejects the whole selection if only one of two chapters is purchased", async () => {
    expect(await authorizeOfflineChapters({ ...request(), chapterIds: ["chapter-a", "chapter-b"] })).toEqual({ ok: false, reason: "forbidden" });
  });

  it("rechecks a purchase and denies after its entitlement is deleted", async () => {
    expect((await authorizeOfflineChapters(request())).ok).toBe(true);
    rows.entitlements = [];
    expect((await authorizeOfflineChapters(request())).ok).toBe(false);
  });

  it("keeps whole-book purchases distinct and preserves requested chapter order", async () => {
    rows.entitlements = [{ id: "book-purchase", user_id: "reader", book_id: "book", chapter_id: null, source: "purchase" }];
    const result = await authorizeOfflineChapters({ ...request(), chapterIds: ["chapter-b", "chapter-a"] });
    expect(result).toMatchObject({ ok: true, grants: [{ chapterId: "chapter-b", source: "book_purchase" }, { chapterId: "chapter-a", source: "book_purchase" }] });
  });

  it.each([null, "invalid", new Date(now).toISOString()])("denies Plus with unverified expiry %s", async (currentPeriodEnd) => {
    rows.entitlements = [];
    rows.billing_accounts = [{ user_id: "reader", role: "reader", plan: "plus", status: "active", current_period_end: currentPeriodEnd }];
    expect((await authorizeOfflineChapters(request())).ok).toBe(false);
  });

  it.each(["plus", "pro"])("limits reader plan %s to the verified subscription expiry", async (plan) => {
    rows.entitlements = [];
    rows.billing_accounts = [{ user_id: "reader", role: "reader", plan, status: "active", current_period_end: new Date(now + 10_000).toISOString() }];
    expect(await authorizeOfflineChapters(request())).toMatchObject({ ok: true, expiresAt: now + 10_000, grants: [{ source: "plus", rightExpiresAt: now + 10_000 }] });
    expect(queries.find((query) => query.table === "billing_accounts")?.filters).toEqual([["user_id", "reader"], ["role", "reader"]]);
  });

  it("does not use an author-role subscription or another user's entitlement", async () => {
    rows.entitlements[0].user_id = "other-reader";
    rows.billing_accounts = [{ user_id: "reader", role: "author", plan: "pro", status: "active", current_period_end: new Date(policyEnd).toISOString() }];
    expect((await authorizeOfflineChapters(request())).ok).toBe(false);
  });

  it("does not extend chapter-only rights after the book changes to book-only pricing", async () => {
    rows.books[0].pricing_model = "book_only";
    expect((await authorizeOfflineChapters(request())).ok).toBe(false);
  });

  it("does not label a timed author subscription as a permanent purchase", async () => {
    rows.entitlements = [];
    rows.author_subscriptions = [{ id: "author-sub", subscriber_user_id: "reader", author_id: "author", status: "active", current_period_end: new Date(now + 20_000).toISOString() }];
    expect(await authorizeOfflineChapters(request())).toMatchObject({ ok: true, expiresAt: now + 20_000, grants: [{ source: "author_subscription", rightExpiresAt: now + 20_000, entitlementId: "author-sub" }] });
    rows.author_subscriptions[0].status = "canceled";
    expect((await authorizeOfflineChapters(request())).ok).toBe(false);
  });

  it.each(["books", "book_versions", "chapters", "entitlements", "billing_accounts", "author_subscriptions"])("fails closed on %s database errors", async (table) => {
    rows.entitlements = []; failedTable = table;
    expect(await authorizeOfflineChapters(request())).toEqual({ ok: false, reason: "verification_failed" });
    expect(console.error).toHaveBeenCalledWith("[offline access] Could not verify chapter access", expect.any(Object));
  });

  it.each(["wrong_book", "wrong_edition", "unreleased", "unknown_publication", "unpublished", "deleted", "negative_order", "fractional_count", "unknown_price"])("denies %s chapter metadata", async (problem) => {
    if (problem === "wrong_book") rows.chapters[0].book_id = "other";
    if (problem === "wrong_edition") rows.chapters[0].book_version_id = "other";
    if (problem === "unreleased") rows.chapters[0].order = 2;
    if (problem === "unknown_publication") rows.book_versions[0].published_chapter_count = null;
    if (problem === "unpublished") rows.books[0].status = "DRAFT";
    if (problem === "deleted") rows.chapters[0].deleted_at = new Date(now).toISOString();
    if (problem === "negative_order") rows.chapters[0].order = -1;
    if (problem === "fractional_count") rows.book_versions[0].published_chapter_count = 1.5;
    if (problem === "unknown_price") rows.books[0].price_amount = null;
    expect((await authorizeOfflineChapters(request())).ok).toBe(false);
  });

  it.each([{ chapterIds: [] }, { chapterIds: ["chapter-a", "chapter-a"] }])("rejects invalid chapter selection $chapterIds", async ({ chapterIds }) => {
    expect(await authorizeOfflineChapters({ ...request(), chapterIds })).toEqual({ ok: false, reason: "invalid_request" });
  });

  it("keeps a shorter policy boundary even when the subscription lasts longer", async () => {
    rows.entitlements = [];
    rows.billing_accounts = [{ user_id: "reader", role: "reader", plan: "plus", status: "trialing", current_period_end: new Date(policyEnd + 100_000).toISOString() }];
    expect(await authorizeOfflineChapters(request())).toMatchObject({ ok: true, expiresAt: policyEnd });
  });

  it("denies if the policy expires while authentication is in progress", async () => {
    const client = database();
    client.auth.getUser = async () => { vi.setSystemTime(policyEnd); return { data: { user: { id: "reader" } }, error: null }; };
    mocks.createClient.mockResolvedValue(client);
    expect((await authorizeOfflineChapters(request())).ok).toBe(false);
  });

  it("requires a verified expiry for author subscriptions too", async () => {
    rows.entitlements = [];
    rows.author_subscriptions = [{ id: "author-sub", subscriber_user_id: "reader", author_id: "author", status: "active", current_period_end: null }];
    expect((await authorizeOfflineChapters(request())).ok).toBe(false);
  });

  it("denies private published editions even when their author passes RLS", async () => {
    rows.books[0].author_id = "reader";
    rows.book_versions[0].visibility = "private";
    expect(await authorizeOfflineChapters(request())).toEqual({ ok: false, reason: "unpublished" });
  });

  it("rechecks follower-only visibility independently of purchase rights", async () => {
    rows.book_versions[0].visibility = "followers";
    rows.author_followers = [{ author_id: "author", follower_id: "reader" }];
    expect((await authorizeOfflineChapters(request())).ok).toBe(true);
    expect(queries.find((query) => query.table === "author_followers")?.filters).toEqual([["author_id", "author"], ["follower_id", "reader"]]);
    rows.author_followers = [];
    expect((await authorizeOfflineChapters(request())).ok).toBe(false);
  });

  it("fails closed when follower visibility cannot be verified", async () => {
    rows.book_versions[0].visibility = "followers";
    failedTable = "author_followers";
    expect(await authorizeOfflineChapters(request())).toEqual({ ok: false, reason: "verification_failed" });
  });

  it("does not require authors to follow themselves for their followers-only edition", async () => {
    rows.books[0].author_id = "reader";
    rows.book_versions[0].visibility = "followers";
    expect(await authorizeOfflineChapters(request())).toMatchObject({ ok: true, grants: [{ source: "author" }] });
    expect(queries.some((query) => query.table === "author_followers")).toBe(false);
  });

  it.each(["free", "author"])("does not add a Plus gate for verified %s access", async (source) => {
    if (source === "free") rows.books[0].price_amount = 0;
    else rows.books[0].author_id = "reader";
    expect(await authorizeOfflineChapters(request())).toMatchObject({ ok: true, expiresAt: policyEnd, grants: [{ source, rightExpiresAt: null }] });
    expect(queries.some((query) => query.table === "billing_accounts")).toBe(false);
  });
});
