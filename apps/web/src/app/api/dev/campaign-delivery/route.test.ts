import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const store = vi.hoisted(() => vi.fn());
vi.mock("@/lib/marketing/local-delivery-store", () => ({ localDeliveryAction: store, LocalDeliveryError: class extends Error {} }));
import { GET, POST } from "./route";
beforeEach(() => { vi.stubEnv("NODE_ENV", "development"); store.mockResolvedValue({ post: {}, deliveries: [] }); });
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
it.each(["production", "test"])("rejects %s before storage", async mode => {
  vi.stubEnv("NODE_ENV", mode);
  expect((await GET(new NextRequest("http://localhost:3066/api/dev/campaign-delivery"))).status).toBe(404);
  expect(store).not.toHaveBeenCalled();
});
it("rejects non-loopback and cross-origin mutations before storage", async () => {
  expect((await GET(new NextRequest("https://example.com/api/dev/campaign-delivery"))).status).toBe(404);
  expect((await POST(new NextRequest("http://localhost:3066/api/dev/campaign-delivery", { method: "POST", headers: { origin: "https://example.com" }, body: "{}" }))).status).toBe(403);
  expect(store).not.toHaveBeenCalled();
});
it("creates an opaque httpOnly session and disables caching", async () => {
  const response = await GET(new NextRequest("http://localhost:3066/api/dev/campaign-delivery"));
  expect(response.status).toBe(200);
  expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(store.mock.calls[0][0]).toMatch(/^[a-f0-9-]{36}$/);
});
it("rejects writes without an existing session and malformed bodies", async () => {
  const headers = { origin: "http://localhost:3066", "content-type": "application/json" };
  expect((await POST(new NextRequest("http://localhost:3066/api/dev/campaign-delivery", { method: "POST", headers, body: "{}" }))).status).toBe(409);
  expect(store).not.toHaveBeenCalled();
});
it("uses the browser Host when Next normalizes its internal URL to localhost", async () => {
  const response = await POST(new NextRequest("http://localhost:3066/api/dev/campaign-delivery", { method: "POST", headers: {
    host: "127.0.0.1:3066", origin: "http://127.0.0.1:3066", cookie: "campaign-delivery-fixture=11111111-1111-4111-8111-111111111111",
  }, body: JSON.stringify({ action: "consume", outcome: "success" }) }));
  expect(response.status).toBe(200);
});
it("rejects a remote Host even when Next has a loopback internal URL", async () => {
  expect((await GET(new NextRequest("http://localhost:3066/api/dev/campaign-delivery", { headers: { host: "attacker.example:3066" } }))).status).toBe(404);
  expect(store).not.toHaveBeenCalled();
});
