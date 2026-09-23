import { z } from "zod";

// Working ceiling for review; production offline remains disabled.
export const MAX_OFFLINE_LEASE_MS = 24 * 60 * 60 * 1000;
export const OFFLINE_AUDIENCE = "verkli-offline-text-v1";
export const OFFLINE_FIXTURE_AUDIENCE = "verkli-offline-fixture-v1";
const identifier = z.string().min(1).max(128);
export const offlineLeaseSchema = z.object({
  version: z.literal(1),
  audience: z.enum([OFFLINE_AUDIENCE, OFFLINE_FIXTURE_AUDIENCE]),
  userId: identifier,
  bookId: identifier,
  editionId: identifier,
  chapters: z.array(z.object({ id: identifier, hash: z.string().regex(/^[a-f0-9]{64}$/) }).strict()).min(1).max(500),
  issuedAt: z.number().int().nonnegative().safe(),
  expiresAt: z.number().int().positive().safe(),
}).strict().refine((lease) => lease.expiresAt > lease.issuedAt && lease.expiresAt - lease.issuedAt <= MAX_OFFLINE_LEASE_MS
  && new Set(lease.chapters.map((chapter) => chapter.id)).size === lease.chapters.length, "Invalid offline lease bounds");

export type OfflineLease = z.infer<typeof offlineLeaseSchema>;
export type SignedOfflineLease = { payload: string; signature: string };

export async function hashOfflineText(text: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** The caller must pin a trusted verification key and audience, never take a
 * verification key from a downloaded book/lease. No browser secret is required. */
export async function verifyOfflineLease(
  publicKey: CryptoKey,
  signed: SignedOfflineLease,
  userId: string,
  now: number,
  audience: OfflineLease["audience"] = OFFLINE_AUDIENCE,
): Promise<OfflineLease> {
  if (!Number.isSafeInteger(now) || signed.payload.length > 128_000 || signed.signature.length > 128) {
    throw new Error("Invalid offline lease.");
  }
  const signature = Uint8Array.from(atob(signed.signature), (char) => char.charCodeAt(0));
  const valid = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, publicKey, signature, new TextEncoder().encode(signed.payload));
  if (!valid) throw new Error("Invalid offline lease signature.");
  const lease = offlineLeaseSchema.parse(JSON.parse(signed.payload));
  if (lease.audience !== audience) throw new Error("Offline lease belongs to a different application.");
  if (lease.userId !== userId) throw new Error("Offline copy belongs to another account.");
  if (now < lease.issuedAt) throw new Error("Device clock changed. Reconnect to verify access.");
  if (now >= lease.expiresAt) throw new Error("Offline access expired. Reconnect to verify access.");
  return lease;
}
