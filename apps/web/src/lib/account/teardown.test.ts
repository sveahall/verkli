import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DELETION_GRACE_DAYS,
  REMOVED_AUTHOR_NAME,
  findDueDeletions,
  graceCutoff,
  runAccountTeardownSweep,
  tearDownAccount,
  tombstoneEmail,
} from "./teardown";

const NOW = new Date("2026-09-22T12:00:00.000Z");
const USER = "11111111-1111-4111-8111-111111111111";

type Call = { table: string; op: string; payload?: unknown; filters: Array<[string, ...unknown[]]> };

type Options = {
  due?: string[];
  failOn?: string;
  listError?: boolean;
  /** What the pre-teardown intent re-check sees. Null means no profile row. */
  intent?: { deletion_requested_at: string | null; deletion_completed_at: string | null } | null;
};

function database(options: Options = {}) {
  const calls: Call[] = [];
  const updateUserById = vi.fn(async () => ({ error: options.failOn === "auth" ? { code: "auth" } : null }));

  const admin = {
    auth: { admin: { updateUserById } },
    from(table: string) {
      const chain: Record<string, unknown> = {};
      let call: Call | null = null;
      const record = (op: string, payload?: unknown) => {
        call = { table, op, payload, filters: [] };
        calls.push(call);
        return chain;
      };
      const filter = (name: string) => (...args: unknown[]) => { call?.filters.push([name, ...args]); return chain; };
      chain.select = () => record("select");
      // The teardown re-reads intent before destroying anything; default to a
      // pending, not-yet-completed request so the happy path proceeds.
      chain.maybeSingle = async () => options.intent === null
        ? { data: null, error: null }
        : { data: options.intent ?? { deletion_requested_at: "2026-09-01T00:00:00.000Z", deletion_completed_at: null }, error: null };
      chain.delete = () => record("delete");
      chain.update = (payload: unknown) => record("update", payload);
      chain.insert = (payload: unknown) => { record("insert", payload); return Promise.resolve({ error: options.failOn === "audit_log" && table === "audit_log" ? { code: "audit" } : null }); };
      for (const name of ["eq", "not", "lt", "is"]) chain[name] = filter(name);
      chain.limit = () => Promise.resolve(
        options.listError
          ? { data: null, error: { code: "PGRST301" } }
          : { data: (options.due ?? []).map((user_id) => ({ user_id })), error: null }
      );
      // Terminal await on delete/update resolves here.
      chain.then = (resolve: (value: unknown) => void) =>
        Promise.resolve({ error: options.failOn === table ? { code: "boom" } : null }).then(resolve);
      return chain;
    },
  };
  return { admin: admin as unknown as Parameters<typeof tearDownAccount>[0], calls, updateUserById };
}

describe("account teardown", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("waits out the grace window before anything is carried out", () => {
    expect(graceCutoff(NOW)).toBe(new Date(NOW.getTime() - DELETION_GRACE_DAYS * 86_400_000).toISOString());
    expect(DELETION_GRACE_DAYS).toBeGreaterThanOrEqual(7);
  });

  it("only picks requests past the window that have not already been carried out", async () => {
    const db = database({ due: [USER] });
    expect(await findDueDeletions(db.admin, NOW)).toEqual([USER]);
    const query = db.calls.find((call) => call.table === "profiles");
    expect(query?.filters).toContainEqual(["not", "deletion_requested_at", "is", null]);
    expect(query?.filters).toContainEqual(["lt", "deletion_requested_at", graceCutoff(NOW)]);
    expect(query?.filters).toContainEqual(["is", "deletion_completed_at", null]);
  });

  it("carries out nothing when the queue cannot be read", async () => {
    const db = database({ listError: true });
    expect(await findDueDeletions(db.admin, NOW)).toEqual([]);
  });

  it("erases the person: private AI data, profile identity, and sign-in", async () => {
    const db = database();
    expect(await tearDownAccount(db.admin, USER, NOW)).toEqual({ userId: USER, ok: true });

    const deleted = db.calls.filter((call) => call.op === "delete").map((call) => call.table);
    expect(deleted).toEqual(["ai_messages", "ai_threads", "ai_memories", "ai_memory_settings"]);

    const updates = db.calls.filter((call) => call.table === "profiles" && call.op === "update");
    expect(updates[0]?.payload).toEqual({
      display_name: REMOVED_AUTHOR_NAME,
      bio: null, avatar_url: null, cover_image: null, website_url: null, social_links: null,
      username: null, is_public: false,
    });
    // Completion is a separate write, made only after the ban succeeded.
    expect(updates[1]?.payload).toEqual({
      deletion_requested_at: null,
      deletion_completed_at: NOW.toISOString(),
    });
    expect(db.updateUserById).toHaveBeenCalledWith(USER, expect.objectContaining({ user_metadata: {} }));

    expect(db.updateUserById).toHaveBeenCalledWith(USER, expect.objectContaining({ email: tombstoneEmail(USER) }));
    expect(tombstoneEmail(USER)).toMatch(/@removed\.invalid$/);
  });

  /**
   * The sharpest edge in the whole feature. The chapters SELECT policy requires
   * `book_versions.published_at IS NOT NULL` for everyone except the author,
   * and an entitlement is an ADDITIONAL condition rather than an alternative —
   * so unpublishing would revoke access from every reader who paid. Bookkeeping
   * records are separately protected by law.
   */
  it("never touches books, orders or pod_orders", async () => {
    const db = database();
    await tearDownAccount(db.admin, USER, NOW);
    const touched = new Set(db.calls.map((call) => call.table));
    for (const table of ["books", "book_versions", "chapters", "orders", "pod_orders", "entitlements"]) {
      expect(touched.has(table)).toBe(false);
    }
  });

  it("stops at the failing step and reports which one, rather than reporting success", async () => {
    for (const step of ["ai_threads", "profiles", "auth"]) {
      const db = database({ failOn: step });
      expect(await tearDownAccount(db.admin, USER, NOW)).toEqual({ userId: USER, ok: false, step });
    }
  });

  it("leaves sign-in working until the data is actually gone", async () => {
    const db = database({ failOn: "profiles" });
    await tearDownAccount(db.admin, USER, NOW);
    // A banned account with its data intact is the worst of both: unreachable
    // support and undeleted personal data.
    expect(db.updateUserById).not.toHaveBeenCalled();
  });

  it("still reports success when only the audit entry fails, so it is not retried against an erased account", async () => {
    const db = database({ failOn: "audit_log" });
    expect(await tearDownAccount(db.admin, USER, NOW)).toEqual({ userId: USER, ok: true });
  });

  /**
   * Found by an outside review. Completion used to be written in the same
   * update as the profile erasure, before the ban. A failed ban then left the
   * account excluded from every future sweep — half-erased, still signed in,
   * and never retried.
   */
  it("does not record completion when the ban fails, so the sweep retries it", async () => {
    const db = database({ failOn: "auth" });
    expect(await tearDownAccount(db.admin, USER, NOW)).toEqual({ userId: USER, ok: false, step: "auth" });
    const updates = db.calls.filter((call) => call.table === "profiles" && call.op === "update");
    expect(updates).toHaveLength(1);
    expect(updates[0]?.payload).not.toHaveProperty("deletion_completed_at");
  });

  /**
   * Also found by an outside review. The sweep lists due accounts and then works
   * through them one at a time, so a withdrawal can land after the list was
   * taken. Without this the author is told "Keep my account" worked and loses it.
   */
  it("skips an account that withdrew after the sweep listed it", async () => {
    const withdrawn = database({ intent: { deletion_requested_at: null, deletion_completed_at: null } });
    expect(await tearDownAccount(withdrawn.admin, USER, NOW)).toEqual({ userId: USER, ok: true, skipped: "withdrawn" });
    expect(withdrawn.calls.some((call) => call.op === "delete")).toBe(false);
    expect(withdrawn.updateUserById).not.toHaveBeenCalled();

    const already = database({ intent: { deletion_requested_at: "2026-09-01T00:00:00.000Z", deletion_completed_at: "2026-09-10T00:00:00.000Z" } });
    expect(await tearDownAccount(already.admin, USER, NOW)).toMatchObject({ ok: true, skipped: "withdrawn" });
    expect(already.updateUserById).not.toHaveBeenCalled();
  });

  it("clears the signup name and avatar, not just the profile row", async () => {
    // public-author.ts falls back to auth user_metadata when the profile row
    // cannot be read, so erasing the profile alone does not erase the person.
    const db = database();
    await tearDownAccount(db.admin, USER, NOW);
    expect(db.updateUserById).toHaveBeenCalledWith(USER, expect.objectContaining({ user_metadata: {} }));
  });

  it("sweeps every due account and is a no-op when none are", async () => {
    expect(await runAccountTeardownSweep(database().admin, NOW)).toEqual([]);
    const outcomes = await runAccountTeardownSweep(database({ due: [USER, "22222222-2222-4222-8222-222222222222"] }).admin, NOW);
    expect(outcomes).toHaveLength(2);
    expect(outcomes.every((outcome) => outcome.ok)).toBe(true);
  });
});
