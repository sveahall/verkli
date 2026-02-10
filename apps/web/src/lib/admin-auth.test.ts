import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { checkAdmin, _failMapForTesting } from "./admin-auth";

const REAL_KEY = "test-admin-key-abc123";
const originalEnv = process.env.ADMIN_API_KEY;

function req(key?: string): Request {
  const headers: Record<string, string> = {};
  if (key) headers["x-admin-key"] = key;
  headers["x-forwarded-for"] = "10.0.0.1";
  return new Request("http://localhost/api/admin/test", { headers });
}

describe("checkAdmin", () => {
  beforeEach(() => {
    process.env.ADMIN_API_KEY = REAL_KEY;
    _failMapForTesting.clear();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env.ADMIN_API_KEY = originalEnv;
    vi.restoreAllMocks();
  });

  it("returns null (pass) with correct key", () => {
    expect(checkAdmin(req(REAL_KEY))).toBeNull();
  });

  it("returns 403 with wrong key", () => {
    const res = checkAdmin(req("wrong"));
    expect(res!.status).toBe(403);
  });

  it("returns 403 when no key header sent", () => {
    const res = checkAdmin(req());
    expect(res!.status).toBe(403);
  });

  it("returns 429 after 5 failures from same IP", () => {
    for (let i = 0; i < 5; i++) {
      expect(checkAdmin(req("wrong"))!.status).toBe(403);
    }
    expect(checkAdmin(req("wrong"))!.status).toBe(429);
  });

  it("correct key still blocked after rate limit hit", () => {
    for (let i = 0; i < 5; i++) {
      checkAdmin(req("wrong"));
    }
    expect(checkAdmin(req(REAL_KEY))!.status).toBe(429);
  });

  it("emits structured audit log on success", () => {
    checkAdmin(req(REAL_KEY));
    expect(console.info).toHaveBeenCalledTimes(1);
    const logged = JSON.parse(
      (console.info as ReturnType<typeof vi.fn>).mock.calls[0][0],
    );
    expect(logged).toMatchObject({
      audit: "admin_auth",
      ip: "10.0.0.1",
      path: "/api/admin/test",
      success: true,
    });
    expect(logged.ts).toBeDefined();
  });

  it("emits structured audit log on failure", () => {
    checkAdmin(req("wrong"));
    const logged = JSON.parse(
      (console.info as ReturnType<typeof vi.fn>).mock.calls[0][0],
    );
    expect(logged).toMatchObject({
      audit: "admin_auth",
      success: false,
    });
  });
});
