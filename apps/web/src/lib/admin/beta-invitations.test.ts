import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { createAdminClient } from "@/lib/supabase/admin";
const mocks = vi.hoisted(() => ({ author: vi.fn(), reader: vi.fn(), send: vi.fn(), prepare: vi.fn() }));
vi.mock("../auth/beta", () => ({ ensureBetaAuthorAccess: mocks.author, grantBetaAccess: mocks.reader }));
vi.mock("../emails/beta-delivery", () => ({ sendBetaWelcome: mocks.send, prepareBetaWelcome: mocks.prepare, getBetaMailAllowance: vi.fn() }));
import { inviteBetaRecipient } from "./beta-invitations";
function database(options: { account?: boolean; authError?: boolean; stampError?: boolean; role?: string } = {}) {
  const order: string[] = [];
  const user = { id: "u1", email: "canonical@example.com" };
  const client = {
    auth: { admin: { getUserById: vi.fn(async () => ({ data: { user }, error: options.authError ? {} : null })), listUsers: vi.fn(async () => ({ data: { users: options.account ? [{ ...user, email: "waiting@example.com" }] : [] }, error: options.authError ? {} : null })) } },
    from: vi.fn((table: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: table === "profiles" ? { role: options.role ?? "author" } : { email: "waiting@example.com" }, error: null }) }) }),
      update: () => ({ eq: () => ({ select: () => ({ single: async () => { order.push("stamp"); return { data: options.stampError ? null : { id: "w1" }, error: options.stampError ? {} : null }; } }) }) }),
    })),
  };
  mocks.author.mockImplementation(async () => { order.push("grant"); return { ok: true }; });
  mocks.reader.mockImplementation(async () => { order.push("grant"); return { ok: true }; });
  mocks.send.mockImplementation(async () => { order.push("send"); return { status: "sent" }; });
  return { admin: client as unknown as ReturnType<typeof createAdminClient>, client, order };
}
describe("beta invitation access before delivery", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.prepare.mockResolvedValue(null); vi.stubEnv("BETA_AUTOGRANT_FROM_WAITLIST", "true"); });
  afterEach(() => vi.unstubAllEnvs());
  it("uses canonical account email and establishes author access before sending", async () => {
    const db = database();
    await inviteBetaRecipient(db.admin, "admin", { id: "u1", source: "user" });
    expect(db.order).toEqual(["grant", "send"]);
    expect(mocks.send).toHaveBeenCalledWith(db.admin, expect.objectContaining({ email: "canonical@example.com", accountExists: true, audience: "author" }));
  });
  it("reserves new-author access before delivering signup instructions", async () => {
    const db = database();
    await inviteBetaRecipient(db.admin, "admin", { id: "w1", source: "author_waitlist" });
    expect(db.order).toEqual(["stamp", "send"]);
    expect(mocks.send).toHaveBeenCalledWith(db.admin, expect.objectContaining({ email: "waiting@example.com", accountExists: false, audience: "author" }));
  });
  it("grants an existing reader beta without author promotion", async () => {
    const db = database({ account: true });
    await inviteBetaRecipient(db.admin, "admin", { id: "w1", source: "reader_waitlist" });
    expect(db.order).toEqual(["stamp", "grant", "send"]);
    expect(mocks.author).not.toHaveBeenCalled(); expect(mocks.reader).toHaveBeenCalled();
    expect(mocks.send).toHaveBeenCalledWith(db.admin, expect.objectContaining({ audience: "reader", accountExists: true }));
  });
  it("preserves legacy delivery across existing-account targets", async () => {
    const db = database(); mocks.prepare.mockResolvedValue({ status: "review_required", message: "Older invitation" });
    const result = await inviteBetaRecipient(db.admin, "admin", { id: "u1", source: "user" });
    expect(result.delivery.status).toBe("review_required"); expect(mocks.send).not.toHaveBeenCalled();
  });
  it("does not send when account lookup fails rather than assuming new account", async () => {
    const db = database({ authError: true });
    await expect(inviteBetaRecipient(db.admin, "admin", { id: "w1", source: "author_waitlist" })).rejects.toThrow("lookup failed");
    expect(db.order).toEqual([]);
  });
  it("does not send when the invitation stamp fails", async () => {
    const db = database({ stampError: true });
    await expect(inviteBetaRecipient(db.admin, "admin", { id: "w1", source: "author_waitlist" })).rejects.toThrow("could not be reserved");
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("does not send after a failed access grant", async () => {
    const db = database(); mocks.author.mockResolvedValue({ ok: false, error: "denied" });
    await expect(inviteBetaRecipient(db.admin, "admin", { id: "u1", source: "user" })).rejects.toThrow("could not be enabled");
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("blocks new-account invitations when callback redemption is disabled", async () => {
    const db = database(); vi.stubEnv("BETA_AUTOGRANT_FROM_WAITLIST", "false");
    await expect(inviteBetaRecipient(db.admin, "admin", { id: "w1", source: "author_waitlist" })).rejects.toThrow("redemption is disabled");
    expect(db.order).toEqual([]);
  });
});
