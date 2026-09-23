import { afterEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";
import { verifyOfflineLease } from "@/lib/offline/lease";

const request = (body: unknown) => new Request("http://localhost/api/dev/offline-reader-fixture", { method: "POST", body: JSON.stringify(body) });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe("offline fixture gate", () => {
  it("is unavailable in production before any key or content is returned", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect((await GET()).status).toBe(404);
    expect((await POST(request({ owner: "fixture-reader-a", action: "download" }))).status).toBe(404);
  });
  it("accepts only its fixed fake owners and never user-supplied text", async () => {
    vi.stubEnv("NODE_ENV", "development");
    expect((await POST(request({ owner: "real-user", action: "download" }))).status).toBe(400);
    expect((await POST(request({ owner: "fixture-reader-a", action: "download", text: "private manuscript" }))).status).toBe(400);
  });
  it("keeps the isolated key stable when development hot reload rebuilds the route", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const before = await (await GET()).json();
    vi.resetModules();
    const reloaded = await import("./route");
    const after = await (await reloaded.GET()).json();
    expect(after.publicKey).toEqual(before.publicKey);
  });
  it("reports signing failure without returning content or success", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.spyOn(crypto.subtle, "sign").mockRejectedValueOnce(new Error("Signing unavailable"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await POST(request({ owner: "fixture-reader-a", action: "download" }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Could not complete fixture request. Nothing was marked as saved." });
    expect(log).toHaveBeenCalledWith("[offline fixture] Could not complete fixture request", expect.any(Error));
  });
  it("returns no-store synthetic text signed for the fixture audience only", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const response = await POST(request({ owner: "fixture-reader-a", action: "download" }));
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = await response.json();
    const key = await crypto.subtle.importKey("jwk", (await (await GET()).json()).publicKey, { name: "ECDSA", namedCurve: "P-256" }, true, ["verify"]);
    await expect(verifyOfflineLease(key, body.lease, "fixture-reader-a", Date.now())).rejects.toThrow("application");
    expect(body.chapters).toEqual([expect.objectContaining({ id: "fixture-chapter" })]);
  });
});
