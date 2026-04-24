import crypto from "node:crypto";

/**
 * HMAC-signed one-click unsubscribe token.
 *
 * Embedded in every outgoing newsletter so a recipient who is not signed in
 * (or has never been signed in) can still honor their right to stop
 * receiving emails. This is a CAN-SPAM and GDPR requirement — failing to
 * provide it is a legal exposure, not just a UX wart.
 *
 * Token format: `v1.<base64url(payload-json)>.<base64url(hmac-sha256)>`.
 * Payload: `{ a: authorId, s: subscriberUserId, e: expiresAtUnixSeconds }`.
 *
 * The signing key is derived from either `NEWSLETTER_UNSUBSCRIBE_SECRET`
 * (preferred) or, as a fallback, SUPABASE_SERVICE_ROLE_KEY. Rotating the
 * secret invalidates all in-flight tokens — acceptable since the TTL is
 * long but bounded.
 */

const TOKEN_VERSION = "v1";
const TTL_SECONDS = 60 * 60 * 24 * 180; // ~6 months — long enough for a
// recipient who archived an email to still unsubscribe, short enough to
// invalidate stale tokens if the secret rotates.

type TokenPayload = {
  a: string;
  s: string;
  e: number;
};

function getSigningSecret(): string {
  const primary = process.env.NEWSLETTER_UNSUBSCRIBE_SECRET?.trim();
  if (primary) return primary;
  const fallback = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (fallback) return fallback;
  throw new Error(
    "Missing NEWSLETTER_UNSUBSCRIBE_SECRET (or SUPABASE_SERVICE_ROLE_KEY fallback)"
  );
}

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf.toString("base64url");
}

function base64UrlDecodeToString(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

function signPayload(serialized: string): string {
  const hmac = crypto.createHmac("sha256", getSigningSecret());
  hmac.update(serialized);
  return base64UrlEncode(hmac.digest());
}

export function createUnsubscribeToken(
  authorId: string,
  subscriberUserId: string,
  now: Date = new Date()
): string {
  const payload: TokenPayload = {
    a: authorId,
    s: subscriberUserId,
    e: Math.floor(now.getTime() / 1000) + TTL_SECONDS,
  };
  const serialized = JSON.stringify(payload);
  const encodedPayload = base64UrlEncode(serialized);
  const sig = signPayload(serialized);
  return `${TOKEN_VERSION}.${encodedPayload}.${sig}`;
}

export type VerifiedUnsubscribeToken = {
  authorId: string;
  subscriberUserId: string;
};

export function verifyUnsubscribeToken(
  token: string,
  now: Date = new Date()
): VerifiedUnsubscribeToken | null {
  if (typeof token !== "string" || !token) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== TOKEN_VERSION) return null;
  const [, encodedPayload, providedSig] = parts;

  let serialized: string;
  try {
    serialized = base64UrlDecodeToString(encodedPayload);
  } catch {
    return null;
  }

  let expectedSig: string;
  try {
    expectedSig = signPayload(serialized);
  } catch {
    return null;
  }

  // Constant-time comparison.
  const a = Buffer.from(providedSig, "base64url");
  const b = Buffer.from(expectedSig, "base64url");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  let payload: TokenPayload;
  try {
    payload = JSON.parse(serialized) as TokenPayload;
  } catch {
    return null;
  }

  if (
    !payload ||
    typeof payload.a !== "string" ||
    typeof payload.s !== "string" ||
    typeof payload.e !== "number" ||
    !payload.a ||
    !payload.s
  ) {
    return null;
  }

  if (payload.e * 1000 <= now.getTime()) return null;

  return { authorId: payload.a, subscriberUserId: payload.s };
}
