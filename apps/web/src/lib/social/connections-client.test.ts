import { afterEach, expect, it, vi } from "vitest";
import { connectionsClient, connectionStatus } from "./connections-client";
afterEach(() => vi.unstubAllGlobals());
it("keeps only safe connection fields and rejects failed reads instead of returning an empty list", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ connections: [{ id: "x", platform: "x", platform_username: "author", status: "active", token_expires_at: null, access_token_enc: "must-not-reach-ui" }] })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: "PRO_SUBSCRIPTION_REQUIRED" }), { status: 403 })));
  expect(await connectionsClient.list()).toEqual([{ id: "x", platform: "x", platform_username: "author", status: "active", token_expires_at: null }]);
  await expect(connectionsClient.list()).rejects.toThrow(/requires Pro/);
});
it("never redirects to a caller-controlled unexpected authorization address", async () => {
  const assign = vi.fn(); vi.stubGlobal("window", { location: { assign } });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ authUrl: "https://attacker.invalid/oauth" }))));
  await expect(connectionsClient.connectX()).rejects.toThrow(/Unexpected/); expect(assign).not.toHaveBeenCalled();
});
it("uses the existing X authorization endpoint only after a valid server response", async () => {
  const assign = vi.fn(); vi.stubGlobal("window", { location: { assign } });
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ authUrl: "https://twitter.com/i/oauth2/authorize?state=test-only" }))); vi.stubGlobal("fetch", fetchMock);
  await connectionsClient.connectX(); expect(assign).toHaveBeenCalledWith("https://twitter.com/i/oauth2/authorize?state=test-only"); expect(fetchMock.mock.calls[0][1].method).toBe("POST");
});
it("does not report a disconnect on a failed save", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "SOCIAL_DISCONNECT_FAILED" }), { status: 500 })));
  await expect(connectionsClient.disconnectX()).rejects.toThrow(/Could not disconnect/);
});
it("distinguishes expired, missing-expiry, revoked and malformed statuses", () => {
  const c = { id: "x", platform: "x", platform_username: "author", status: "active", token_expires_at: null };
  expect(connectionStatus(c)).toContain("expiry not provided");
  expect(connectionStatus({ ...c, token_expires_at: "2020-01-01T00:00:00Z" })).toContain("Expired");
  expect(connectionStatus({ ...c, token_expires_at: "broken" })).toBe("Needs attention");
  expect(connectionStatus({ ...c, status: "revoked" })).toBe("Not connected");
});
