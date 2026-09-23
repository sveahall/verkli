import { describe, expect, it } from "vitest";
import { issueOfflineLease } from "./lease-server";
import { verifyOfflineLease, hashOfflineText, MAX_OFFLINE_LEASE_MS } from "./lease";

const now = 1_800_000_000_000;
const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const chapter = { id: "chapter-1", hash: await hashOfflineText("Synthetic story") };
const claims = { userId: "reader-a", bookId: "book", editionId: "en-v1", chapters: [chapter] };

describe("offline lease", () => {
  it("signs only a bounded lease and respects earlier entitlement expiry", async () => {
    const lease = await issueOfflineLease(keys.privateKey, claims, now, now + 60_000);
    expect((await verifyOfflineLease(keys.publicKey, lease, "reader-a", now)).expiresAt).toBe(now + 60_000);
    const full = await issueOfflineLease(keys.privateKey, claims, now, now + 10 * MAX_OFFLINE_LEASE_MS);
    expect((await verifyOfflineLease(keys.publicKey, full, "reader-a", now)).expiresAt).toBe(now + MAX_OFFLINE_LEASE_MS);
  });
  it("rejects another owner, expiry and not-yet-valid access", async () => {
    const lease = await issueOfflineLease(keys.privateKey, claims, now, now + 60_000);
    await expect(verifyOfflineLease(keys.publicKey, lease, "reader-b", now)).rejects.toThrow("account");
    await expect(verifyOfflineLease(keys.publicKey, lease, "reader-a", now + 60_000)).rejects.toThrow("expired");
    await expect(verifyOfflineLease(keys.publicKey, lease, "reader-a", now - 1)).rejects.toThrow("clock");
  });
  it("rejects modified claims, invalid signatures and a different verification key", async () => {
    const lease = await issueOfflineLease(keys.privateKey, claims, now, now + 60_000);
    await expect(verifyOfflineLease(keys.publicKey, { ...lease, payload: lease.payload.replace("reader-a", "reader-b") }, "reader-b", now)).rejects.toThrow();
    const otherKeys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    await expect(verifyOfflineLease(otherKeys.publicKey, lease, "reader-a", now)).rejects.toThrow("signature");
  });
  it("will not issue already expired rights or empty chapter grants", async () => {
    await expect(issueOfflineLease(keys.privateKey, claims, now, now)).rejects.toThrow();
    await expect(issueOfflineLease(keys.privateKey, { ...claims, chapters: [] }, now, now + 60_000)).rejects.toThrow();
  });
});
