import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  signOut: vi.fn(),
  check: vi.fn(),
  from: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  audit: vi.fn(),
  reread: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser, signOut: mocks.signOut } }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: mocks.from }) }));
vi.mock("@/lib/rate-limit", () => ({ createPerUserRateLimiter: () => ({ check: mocks.check }) }));

import { DELETE, POST } from "./route";

function profileResult(data: unknown, error: { message: string } | null = null, conditional?: { data: unknown; error: null }) {
  const result = { data, error };
  // Supports the old unverified update as well as a returning-row update.
  const returning = { select: () => ({ maybeSingle: async () => result }) };
  mocks.eq.mockReturnValue({
    ...result,
    ...returning,
    // The cancel path narrows to rows that actually have a pending request;
    // the request path narrows to rows that do not.
    not: () => returning,
    is: () => ({ select: () => ({ maybeSingle: async () => conditional ?? result }) }),
    // The re-read that tells "already pending" apart from "no profile".
    maybeSingle: async () => result,
  });
}

describe("account deletion request acknowledgement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getUser.mockResolvedValue({ data: { user: { id: "own-user" } } });
    mocks.signOut.mockResolvedValue({ error: null });
    mocks.check.mockResolvedValue({ allowed: true });
    mocks.update.mockReturnValue({ eq: mocks.eq });
    mocks.audit.mockResolvedValue({ error: null });
    mocks.reread.mockResolvedValue({ data: null, error: null });
    mocks.from.mockImplementation((table: string) => {
      if (table === "profiles") return {
        update: mocks.update,
        // The request path re-reads to tell "already pending" apart from
        // "no profile row", so a re-post is idempotent rather than a 500.
        select: () => ({ eq: () => ({ maybeSingle: mocks.reread }) }),
      };
      if (table === "audit_log") return { insert: mocks.audit };
      throw new Error(`Unexpected table ${table}`);
    });
    profileResult({ user_id: "own-user" });
  });

  afterEach(() => vi.restoreAllMocks());

  it("rejects unauthenticated callers before writing", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect((await POST()).status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("rate limits requests before writing", async () => {
    mocks.check.mockResolvedValue({ allowed: false });
    expect((await POST()).status).toBe(429);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("does not acknowledge a request when no profile was updated", async () => {
    profileResult(null);
    const response = await POST();
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ error: "DATABASE_ERROR" });
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  /**
   * Found by an outside review. The request used to overwrite an existing
   * timestamp, which restarts the 14-day grace window — an account could
   * postpone its own deletion indefinitely, one click at a time. The update is
   * now conditional, and a re-post reports the pending request rather than a 500.
   */
  it("does not restart the grace window when a request is already pending", async () => {
    profileResult({ user_id: "own-user" }, null, { data: null, error: null });
    mocks.reread.mockResolvedValue({ data: { deletion_requested_at: "2026-09-01T00:00:00.000Z" }, error: null });
    const response = await POST();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, deletionRequested: true, alreadyRequested: true });
    // No second audit entry and no sign-out: nothing changed.
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("does not sign out after a failed profile update", async () => {
    profileResult(null, { message: "write unavailable" });
    expect((await POST()).status).toBe(500);
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("records only the authenticated user's request and explicitly reports pending deletion", async () => {
    const response = await POST();
    expect(mocks.eq).toHaveBeenCalledWith("user_id", "own-user");
    expect(await response.json()).toMatchObject({ ok: true, deletionRequested: true, signedOut: true });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ entity_id: "own-user", action: "deletion_requested" }));
  });

  it("logs returned audit errors while acknowledging the saved request", async () => {
    mocks.audit.mockResolvedValue({ error: { message: "audit unavailable" } });
    expect((await POST()).status).toBe(200);
    expect(console.error).toHaveBeenCalledWith("[account.delete] audit log insert failed", expect.objectContaining({ message: "audit unavailable" }));
  });

  it("does not claim sign-out succeeded when auth reports an error", async () => {
    mocks.signOut.mockResolvedValue({ error: { message: "auth unavailable" } });
    const response = await POST();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, deletionRequested: true, signedOut: false });
    expect(console.error).toHaveBeenCalledWith("[account.delete] sign out failed", expect.objectContaining({ message: "auth unavailable" }));
  });

  it("still acknowledges a saved request when audit and sign-out requests throw", async () => {
    mocks.audit.mockRejectedValue(new Error("audit network error"));
    mocks.signOut.mockRejectedValue(new Error("auth network error"));
    const response = await POST();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, deletionRequested: true, signedOut: false });
    expect(console.error).toHaveBeenCalledWith("[account.delete] audit log insert failed", expect.objectContaining({ message: "audit network error" }));
    expect(console.error).toHaveBeenCalledWith("[account.delete] sign out failed", expect.objectContaining({ message: "auth network error" }));
  });
});

describe("withdrawing a deletion request", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getUser.mockResolvedValue({ data: { user: { id: "own-user" } } });
    mocks.check.mockResolvedValue({ allowed: true });
    mocks.update.mockReturnValue({ eq: mocks.eq });
    mocks.audit.mockResolvedValue({ error: null });
    mocks.reread.mockResolvedValue({ data: null, error: null });
    mocks.from.mockImplementation((table: string) => {
      if (table === "profiles") return {
        update: mocks.update,
        // The request path re-reads to tell "already pending" apart from
        // "no profile row", so a re-post is idempotent rather than a 500.
        select: () => ({ eq: () => ({ maybeSingle: mocks.reread }) }),
      };
      if (table === "audit_log") return { insert: mocks.audit };
      throw new Error(`Unexpected table ${table}`);
    });
    profileResult({ user_id: "own-user" });
  });

  afterEach(() => vi.restoreAllMocks());

  it("rejects unauthenticated callers and rate limits before writing", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect((await DELETE()).status).toBe(401);
    mocks.getUser.mockResolvedValue({ data: { user: { id: "own-user" } } });
    mocks.check.mockResolvedValue({ allowed: false });
    expect((await DELETE()).status).toBe(429);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("clears the request and records the withdrawal", async () => {
    const response = await DELETE();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, deletionRequested: false });
    expect(mocks.update).toHaveBeenCalledWith({ deletion_requested_at: null });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "deletion_cancelled", entity_id: "own-user" }));
  });

  /**
   * The author's goal is "my account is not being deleted". When that is
   * already true, reporting an error would read as though it still is.
   */
  it("succeeds without an audit entry when nothing was pending", async () => {
    profileResult(null);
    const response = await DELETE();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, deletionRequested: false, alreadyCancelled: true });
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("reports a failed write rather than claiming the request was withdrawn", async () => {
    profileResult(null, { message: "db down" });
    expect((await DELETE()).status).toBe(500);
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("still reports success when only the audit entry fails", async () => {
    mocks.audit.mockResolvedValue({ error: { message: "audit down" } });
    const response = await DELETE();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, deletionRequested: false });
    expect(console.error).toHaveBeenCalledWith("[account.delete] cancel audit log insert failed", expect.objectContaining({ message: "audit down" }));
  });
});
