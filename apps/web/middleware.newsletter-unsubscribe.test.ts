import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const m = vi.hoisted(() => ({ client: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient: m.client }));
vi.mock("@/lib/auth/beta", () => ({ isBetaUser: vi.fn(), BetaCheckTransientError: class extends Error {} }));
vi.mock("@/lib/auth/author-approval", () => ({ getAuthorApplicationStatus: vi.fn() }));
import { middleware } from "./middleware";
const path = "https://example.com/api/newsletters/unsubscribe";
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.com");
  vi.stubEnv("NEXT_PUBLIC_WAITLIST_ONLY", "true"); vi.stubEnv("BETA_LOCK", "true");
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe("exact anonymous newsletter confirmation entrypoint", () => {
  it.each(["GET", "HEAD"])("passes %s without auth or a token-bearing waitlist redirect", async method => {
    const response = await middleware(new NextRequest(`${path}?token=synthetic-not-a-secret`, { method }));
    expect(response.status).toBe(200); expect(response.headers.get("location")).toBeNull();
    expect(m.client).not.toHaveBeenCalled();
  });
  it.each(["application/x-www-form-urlencoded", "multipart/form-data; boundary=synthetic"])("allows cookie-free RFC8058/form requests for route-owned signature validation (%s)", async contentType => {
    const response = await middleware(new NextRequest(`${path}?token=synthetic-not-a-secret`, { method: "POST", headers: { "Content-Type": contentType } }));
    expect(response.status).toBe(200); expect(response.headers.get("location")).toBeNull(); expect(m.client).not.toHaveBeenCalled();
  });
  it.each(["application/json", "text/plain", ""])("does not bypass JSON/authenticated or unsupported POST content type %s", async contentType => {
    const response = await middleware(new NextRequest(path, { method: "POST", headers: { "Content-Type": contentType } }));
    expect(response.status).toBe(403); expect(m.client).not.toHaveBeenCalled();
  });
  it.each(["/api/newsletters/unsubscribe/extra", "/api/newsletters/unsubscribe-other", "/api/newsletters/subscribe", "/api/other"])("does not exempt neighboring path %s", async pathname => {
    expect((await middleware(new NextRequest(`https://example.com${pathname}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" } }))).status).toBe(403);
  });
  it.each(["PUT", "DELETE", "PATCH"])("does not exempt wrong method %s", async method => {
    expect((await middleware(new NextRequest(path, { method, headers: { "Content-Type": "application/x-www-form-urlencoded" } }))).status).toBe(403);
  });
});
