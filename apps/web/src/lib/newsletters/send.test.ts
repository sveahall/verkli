import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyUnsubscribeToken } from "./unsubscribe-token";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), send: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/lib/env", () => ({ getServerEnv: () => ({ RESEND_API_KEY: "test-only", RESEND_FROM_EMAIL: "test@example.com" }) }));
vi.mock("resend", () => ({ Resend: class { batch = { send: mocks.send }; } }));
const { sendNewsletter } = await import("./send");

function fixture(options: { count?: number; updateError?: string } = {}) {
  const rows = Array.from({ length: options.count ?? 2 }, (_, i) => ({ subscriber_user_id: `reader-${i}` }));
  const eq = vi.fn().mockReturnThis();
  const select = vi.fn().mockReturnThis();
  const subscriptions = { select, eq, order: vi.fn().mockReturnThis(), range: vi.fn().mockResolvedValue({ data: rows, error: null }), then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ data: rows, error: null })) };
  const update = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: options.updateError ? { message: options.updateError } : null }) }));
  const newsletter = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: "newsletter-1", author_id: "author-1", subject: "News", body_html: '<p>Hello</p><script>alert(1)</script>', body_text: "Hello", status: "draft" }, error: null }), update };
  const getUserById = vi.fn(async (id: string) => ({ data: { user: { id, email: `${id}@example.com` } }, error: null }));
  mocks.admin.mockReturnValue({ from: (table: string) => table === "newsletters" ? newsletter : subscriptions, auth: { admin: { getUserById } } });
  return { update, eq, select, getUserById };
}

describe("newsletter delivery with sandboxed auth and email transport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEWSLETTER_UNSUBSCRIBE_SECRET", "test-only-dedicated-secret");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.com");
    mocks.send.mockImplementation(async (messages: unknown[]) => ({ data: { data: messages.map((_, i) => ({ id: `email-${i}` })) }, error: null }));
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  it("resolves only this author's active audience through auth and signs each recipient's unsubscribe", async () => {
    const f = fixture();
    await expect(sendNewsletter("newsletter-1")).resolves.toEqual({ recipientCount: 2 });
    expect(f.eq).toHaveBeenCalledWith("author_id", "author-1");
    expect(f.eq).toHaveBeenCalledWith("status", "active");
    expect(f.select).toHaveBeenCalledWith("subscriber_user_id");
    expect(f.getUserById).toHaveBeenCalledTimes(2);
    const messages = mocks.send.mock.calls[0][0];
    expect(messages.map((m: { to: string }) => m.to)).toEqual(["reader-0@example.com", "reader-1@example.com"]);
    for (const [i, message] of messages.entries()) {
      expect(message.html).not.toContain("<script>");
      const url = new URL(message.headers["List-Unsubscribe"].slice(1, -1));
      expect(verifyUnsubscribeToken(url.searchParams.get("token")!)).toEqual({ authorId: "author-1", subscriberUserId: `reader-${i}` });
    }
  });

  it("rejects a provider error instead of reporting delivery and marking the draft sent", async () => {
    const f = fixture();
    mocks.send.mockResolvedValue({ data: null, error: { message: "Provider rejected the sender" } });
    await expect(sendNewsletter("newsletter-1")).rejects.toThrow("Provider rejected");
    expect(f.update).not.toHaveBeenCalled();
  });

  it("propagates transport failures without marking the draft sent", async () => {
    const f = fixture();
    mocks.send.mockRejectedValue(new Error("Transport unavailable"));
    await expect(sendNewsletter("newsletter-1")).rejects.toThrow("Transport unavailable");
    expect(f.update).not.toHaveBeenCalled();
  });

  it("fails before sending when resolving a subscriber fails", async () => {
    const f = fixture();
    f.getUserById.mockResolvedValue({ data: { user: null }, error: { message: "Auth unavailable" } } as never);
    await expect(sendNewsletter("newsletter-1")).rejects.toThrow("subscriber");
    expect(mocks.send).not.toHaveBeenCalled();
    expect(f.update).not.toHaveBeenCalled();
  });

  it("does not consume a draft when there are no active recipients", async () => {
    const f = fixture({ count: 0 });
    await expect(sendNewsletter("newsletter-1")).rejects.toThrow("No active subscribers");
    expect(mocks.send).not.toHaveBeenCalled();
    expect(f.update).not.toHaveBeenCalled();
  });

  it("does not report success when saving delivery status fails", async () => {
    fixture({ updateError: "Database unavailable" });
    await expect(sendNewsletter("newsletter-1")).rejects.toThrow("delivery status");
  });
});
