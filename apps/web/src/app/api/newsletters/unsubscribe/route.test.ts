import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createUnsubscribeToken } from "@/lib/newsletters/unsubscribe-token";
const m = vi.hoisted(() => ({ admin: vi.fn(), client: vi.fn(), update: vi.fn(), eq: vi.fn(), error: null as null | { code: string; message: string }, user: { id: "reader-1" } as { id: string } | null }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: m.admin }));
vi.mock("@/lib/supabase/server", () => ({ createClient: m.client }));
const { GET, POST } = await import("./route");
const endpoint = "https://example.com/api/newsletters/unsubscribe";
const token = () => createUnsubscribeToken("author-1", "reader-1");
const formRequest = (value = token(), confirm = "unsubscribe") => new Request(endpoint, { method: "POST", body: new URLSearchParams({ token: value, confirm }) });
function oneClick(value = token(), multipart = false) {
  const body = multipart ? new FormData() : new URLSearchParams();
  body.set("List-Unsubscribe", "One-Click");
  return new Request(`${endpoint}?token=${encodeURIComponent(value)}`, { method: "POST", body });
}
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("NEWSLETTER_UNSUBSCRIBE_SECRET", "test-only-secret"); vi.stubEnv("NEXT_PUBLIC_NEWSLETTERS_ENABLED", "false");
  m.error = null; m.user = { id: "reader-1" };
  const chain = { eq: m.eq, then: (resolve: (value: unknown) => unknown) => Promise.resolve({ error: m.error }).then(resolve) };
  m.eq.mockReturnValue(chain); m.update.mockReturnValue(chain);
  m.admin.mockReturnValue({ from: () => ({ update: m.update }) });
  m.client.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: m.user } }) }, from: () => ({ update: m.update }) });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
function privateResponse(response: Response) {
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(response.headers.get("x-robots-tag")).toContain("noindex");
}
describe("scanner-safe newsletter unsubscribe", () => {
  it("keeps old signed footer GETs usable without any database or auth access, including prefetch", async () => {
    const signed = token();
    for (const purpose of ["", "prefetch"]) {
      const response = await GET(new Request(`${endpoint}?token=${signed}`, { headers: { purpose } }));
      expect(response.status).toBe(200); privateResponse(response);
      const html = await response.text();
      expect(response.headers.get("content-type")).toContain("text/html");
      expect(html).toContain('method="post"');
      expect(html).toContain('action="/api/newsletters/unsubscribe"');
      expect(html).toContain('name="token"');
      expect(html).toContain('name="confirm"');
      expect(html).not.toMatch(/<(script|img|iframe)\b|https?:\/\//i);
      expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
    }
    expect(m.admin).not.toHaveBeenCalled(); expect(m.client).not.toHaveBeenCalled(); expect(m.update).not.toHaveBeenCalled();
  });
  it.each(["missing", "tampered", "expired"])("shows an invalid-link page for %s without reflecting the token or mutating data", async kind => {
    const value = kind === "missing" ? "" : kind === "expired" ? createUnsubscribeToken("author-1", "reader-1", new Date("2020-01-01")) : `${token()}invalid`;
    const response = await GET(new Request(`${endpoint}?token=${value}`));
    expect(response.status).toBe(400); privateResponse(response);
    const html = await response.text(); expect(html).toContain("This link is invalid or expired");
    if (value) expect(html).not.toContain(value);
    expect(m.admin).not.toHaveBeenCalled(); expect(m.client).not.toHaveBeenCalled();
  });
  it("unsubscribes only after explicit human POST and omits the token from success HTML", async () => {
    const signed = token(); const response = await POST(formRequest(signed));
    expect(response.status).toBe(200); privateResponse(response);
    const html = await response.text(); expect(html).toContain("You are unsubscribed"); expect(html).not.toContain(signed);
    expect(m.update).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ status: "unsubscribed" }));
    expect(m.eq).toHaveBeenCalledWith("author_id", "author-1"); expect(m.eq).toHaveBeenCalledWith("subscriber_user_id", "reader-1");
    expect(m.client).not.toHaveBeenCalled();
  });
  it.each([false, true])("retains RFC8058 one-click POST without cookies/login/redirect (multipart=%s)", async multipart => {
    const response = await POST(oneClick(token(), multipart));
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ ok: true }); privateResponse(response);
    expect(response.headers.get("location")).toBeNull(); expect(m.update).toHaveBeenCalledOnce(); expect(m.client).not.toHaveBeenCalled();
  });
  it.each(["empty", "wrong-marker", "invalid-token", "no-confirm", "duplicate-token", "oversized"])("rejects %s POST before database and never falls back to cookie auth", async kind => {
    let request = kind === "empty" ? new Request(`${endpoint}?token=${token()}`, { method: "POST" })
      : kind === "wrong-marker" ? new Request(`${endpoint}?token=${token()}`, { method: "POST", body: new URLSearchParams({ "List-Unsubscribe": "Preview" }) })
        : kind === "invalid-token" ? formRequest("not-signed") : formRequest(token(), "");
    if (kind === "duplicate-token") request = new Request(endpoint, { method: "POST", body: new URLSearchParams([["token", token()], ["token", token()], ["confirm", "unsubscribe"]]) });
    if (kind === "oversized") request = formRequest("x".repeat(9000));
    expect((await POST(request)).status).toBe(400);
    expect(m.admin).not.toHaveBeenCalled(); expect(m.client).not.toHaveBeenCalled(); expect(m.update).not.toHaveBeenCalled();
  });
  it.each(["human", "rfc"])("reports a retryable database error for %s without success or sensitive logging", async mode => {
    const signed = token(); m.error = { code: "08006", message: `private-detail ${signed}` };
    const response = await POST(mode === "human" ? formRequest(signed) : oneClick(signed));
    expect(response.status).toBe(500); privateResponse(response);
    const body = await response.text(); expect(body).not.toContain("You are unsubscribed"); expect(body).not.toContain("private-detail");
    if (mode === "human") { expect(body).toContain("Try again"); expect(body).toContain('method="post"'); }
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(signed);
    expect(m.client).not.toHaveBeenCalled();
  });
  it("sanitizes a thrown storage failure instead of rendering an application error page", async () => {
    m.admin.mockImplementation(() => { throw new Error("private configuration"); });
    const response = await POST(formRequest()); expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("private configuration");
  });
  it("preserves authenticated JSON unsubscribe and rejects signed-out users", async () => {
    const run = () => POST(new Request(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ authorId: "11111111-1111-4111-8111-111111111111" }) }));
    expect((await run()).status).toBe(200); expect(m.admin).not.toHaveBeenCalled();
    m.user = null; expect((await run()).status).toBe(401);
  });
});
