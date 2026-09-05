import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminRoleForApi: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/admin-auth", () => ({ requireAdminRoleForApi: mocks.requireAdminRoleForApi }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));

const { PATCH } = await import("./route");

const BOOK = "11111111-1111-4111-8111-111111111111";
const req = (body: unknown) =>
  new Request("http://localhost/api/admin/books", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

/** Records the update that was applied, and what the audit row claimed. */
function adminStub(opts: {
  existing?: { id: string; status: string | null; title: string | null } | null;
  updates?: Array<Record<string, unknown>>;
  audits?: Array<Record<string, unknown>>;
}) {
  const { existing = { id: BOOK, status: "PUBLISHED", title: "A Book" } } = opts;
  return {
    from(table: string) {
      const b: Record<string, unknown> = {};
      b.select = () => b;
      b.eq = () => b;
      b.maybeSingle = () => Promise.resolve({ data: existing, error: null });
      b.update = (patch: Record<string, unknown>) => {
        if (table === "books") opts.updates?.push(patch);
        return { eq: () => Promise.resolve({ error: null }) };
      };
      b.insert = (row: Record<string, unknown>) => {
        if (table === "audit_log") opts.audits?.push(row);
        return Promise.resolve({ error: null });
      };
      return b;
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdminRoleForApi.mockResolvedValue({ user: { id: "admin-1" }, response: undefined });
});

describe("PATCH /api/admin/books", () => {
  it("unpublishes a live book to DRAFT", async () => {
    const updates: Array<Record<string, unknown>> = [];
    mocks.createAdminClient.mockReturnValue(adminStub({ updates }));

    const res = await PATCH(req({ bookId: BOOK, status: "DRAFT" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.changed).toBe(true);
    expect(updates).toEqual([{ status: "DRAFT" }]);
  });

  it("404s on a book that does not exist, instead of reporting a happy no-op", async () => {
    // PostgREST reports "updated zero rows" exactly like a successful write, so
    // without the pre-read an admin would be told the takedown worked.
    mocks.createAdminClient.mockReturnValue(adminStub({ existing: null }));

    const res = await PATCH(req({ bookId: BOOK, status: "DRAFT" }));

    expect(res.status).toBe(404);
  });

  it("records what the status changed FROM in the audit row", async () => {
    const audits: Array<Record<string, unknown>> = [];
    mocks.createAdminClient.mockReturnValue(adminStub({ audits }));

    await PATCH(req({ bookId: BOOK, status: "DRAFT" }));

    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      entity_type: "book",
      entity_id: BOOK,
      action: "unpublish",
      actor_user_id: "admin-1",
      meta: { from: "PUBLISHED", to: "DRAFT" },
    });
  });

  it("does not write an audit row for a no-op", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const audits: Array<Record<string, unknown>> = [];
    mocks.createAdminClient.mockReturnValue(adminStub({ updates, audits }));

    const body = await (await PATCH(req({ bookId: BOOK, status: "PUBLISHED" }))).json();

    // An audit trail that logs changes nobody made is worse than none.
    expect(body.changed).toBe(false);
    expect(updates).toEqual([]);
    expect(audits).toEqual([]);
  });

  it("rejects a status outside the enum", async () => {
    mocks.createAdminClient.mockReturnValue(adminStub({}));
    const res = await PATCH(req({ bookId: BOOK, status: "DELETED" }));
    expect(res.status).toBe(400);
  });

  it("rejects a non-uuid book id", async () => {
    mocks.createAdminClient.mockReturnValue(adminStub({}));
    const res = await PATCH(req({ bookId: "not-a-uuid", status: "DRAFT" }));
    expect(res.status).toBe(400);
  });

  it("refuses an unauthenticated caller", async () => {
    mocks.requireAdminRoleForApi.mockResolvedValue({
      user: null,
      response: new Response(null, { status: 401 }),
    });
    const res = await PATCH(req({ bookId: BOOK, status: "DRAFT" }));
    expect(res.status).toBe(401);
  });
});
