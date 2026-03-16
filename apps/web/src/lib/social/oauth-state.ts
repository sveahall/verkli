/**
 * HMAC-signed OAuth state parameter with TTL.
 *
 * SOCIAL_OAUTH_STATE_SECRET must only exist in server environments,
 * never in client bundles.
 */

import crypto from "node:crypto";

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const CODE_VERIFIER_BYTES = 32;

function getStateSecret(): string {
  const secret = process.env.SOCIAL_OAUTH_STATE_SECRET;
  if (!secret) {
    throw new Error(
      "SOCIAL_OAUTH_STATE_SECRET is required but missing. " +
        "This env var must only exist in server environments, never in client bundles."
    );
  }
  return secret;
}

function sign(payload: string): string {
  return crypto
    .createHmac("sha256", getStateSecret())
    .update(payload)
    .digest("base64url");
}

function createCodeVerifier(): string {
  return crypto.randomBytes(CODE_VERIFIER_BYTES).toString("base64url");
}

export function createOAuthState(
  userId: string,
  platform: string
): { state: string; codeVerifier: string } {
  const ts = Date.now();
  const codeVerifier = createCodeVerifier();
  const payload = `${userId}:${platform}:${ts}:${codeVerifier}`;
  const sig = sign(payload);
  const obj = { userId, platform, ts, codeVerifier, sig };
  return {
    state: Buffer.from(JSON.stringify(obj)).toString("base64url"),
    codeVerifier,
  };
}

export function verifyOAuthState(
  state: string
): { userId: string; platform: string; codeVerifier: string } | null {
  try {
    const decoded = Buffer.from(state, "base64url").toString("utf8");
    const obj = JSON.parse(decoded) as {
      userId: string;
      platform: string;
      ts: number;
      codeVerifier: string;
      sig: string;
    };

    if (!obj.userId || !obj.platform || !obj.ts || !obj.codeVerifier || !obj.sig) return null;

    const payload = `${obj.userId}:${obj.platform}:${obj.ts}:${obj.codeVerifier}`;
    const expected = sign(payload);
    if (
      !crypto.timingSafeEqual(
        Buffer.from(obj.sig, "base64url"),
        Buffer.from(expected, "base64url")
      )
    ) {
      return null;
    }

    if (Date.now() - obj.ts > STATE_TTL_MS) return null;

    return { userId: obj.userId, platform: obj.platform, codeVerifier: obj.codeVerifier };
  } catch {
    return null;
  }
}
