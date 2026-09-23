import "server-only";
import { MAX_OFFLINE_LEASE_MS, OFFLINE_AUDIENCE, offlineLeaseSchema, type OfflineLease, type SignedOfflineLease } from "./lease";

/** Integration contract: call only after server auth and access checks for
 * EVERY chapter. entitlementUntil must come from verified server rights.
 * Key provisioning and production route integration are deliberately absent. */
export async function issueOfflineLease(
  privateKey: CryptoKey,
  claims: Pick<OfflineLease, "userId" | "bookId" | "editionId" | "chapters">,
  now: number,
  entitlementUntil: number,
  audience: OfflineLease["audience"] = OFFLINE_AUDIENCE,
): Promise<SignedOfflineLease> {
  const lease = offlineLeaseSchema.parse({
    ...claims, version: 1, audience, issuedAt: now,
    expiresAt: Math.min(now + MAX_OFFLINE_LEASE_MS, entitlementUntil),
  });
  const payload = JSON.stringify(lease);
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, new TextEncoder().encode(payload));
  return { payload, signature: btoa(String.fromCharCode(...new Uint8Array(signature))) };
}
