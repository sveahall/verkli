/**
 * HMAC-signed OAuth state parameter with TTL.
 *
 * SOCIAL_OAUTH_STATE_SECRET must only exist in server environments,
 * never in client bundles.
 */

import crypto from "node:crypto";

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const CODE_VERIFIER_BYTES = 32;
const STATE_NONCE_BYTES = 16;
const PKCE_COOKIE_TTL_SECONDS = Math.ceil(STATE_TTL_MS / 1000);

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

function safeCompare(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function createCodeVerifier(): string {
  return crypto.randomBytes(CODE_VERIFIER_BYTES).toString("base64url");
}

function createStateNonce(): string {
  return crypto.randomBytes(STATE_NONCE_BYTES).toString("base64url");
}

export function getOAuthPkceCookieName(platform: string): string {
  return `social_oauth_pkce_${platform}`;
}

export function getOAuthPkceCookieMaxAgeSeconds(): number {
  return PKCE_COOKIE_TTL_SECONDS;
}

export function createOAuthState(
  userId: string,
  platform: string
): { state: string; codeVerifier: string; nonce: string } {
  const ts = Date.now();
  const codeVerifier = createCodeVerifier();
  const nonce = createStateNonce();
  const payload = `${userId}:${platform}:${ts}:${nonce}`;
  const sig = sign(payload);
  const obj = { userId, platform, ts, nonce, sig };
  return {
    state: Buffer.from(JSON.stringify(obj)).toString("base64url"),
    codeVerifier,
    nonce,
  };
}

export function verifyOAuthState(
  state: string
): { userId: string; platform: string; nonce: string } | null {
  try {
    const decoded = Buffer.from(state, "base64url").toString("utf8");
    const obj = JSON.parse(decoded) as {
      userId: string;
      platform: string;
      ts: number;
      nonce: string;
      sig: string;
    };

    if (!obj.userId || !obj.platform || !obj.ts || !obj.nonce || !obj.sig) return null;

    const payload = `${obj.userId}:${obj.platform}:${obj.ts}:${obj.nonce}`;
    const expected = sign(payload);
    if (!safeCompare(obj.sig, expected)) {
      return null;
    }

    if (Date.now() - obj.ts > STATE_TTL_MS) return null;

    return { userId: obj.userId, platform: obj.platform, nonce: obj.nonce };
  } catch {
    return null;
  }
}

export function createOAuthPkceCookieValue(input: {
  platform: string;
  nonce: string;
  codeVerifier: string;
}): string {
  const ts = Date.now();
  const payload = `${input.platform}:${input.nonce}:${ts}:${input.codeVerifier}`;
  const sig = sign(payload);
  return Buffer.from(
    JSON.stringify({
      platform: input.platform,
      nonce: input.nonce,
      ts,
      codeVerifier: input.codeVerifier,
      sig,
    })
  ).toString("base64url");
}

export function verifyOAuthPkceCookieValue(
  value: string,
  expected: { platform: string; nonce: string }
): { codeVerifier: string } | null {
  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    const obj = JSON.parse(decoded) as {
      platform: string;
      nonce: string;
      ts: number;
      codeVerifier: string;
      sig: string;
    };

    if (!obj.platform || !obj.nonce || !obj.ts || !obj.codeVerifier || !obj.sig) {
      return null;
    }

    if (obj.platform !== expected.platform || obj.nonce !== expected.nonce) {
      return null;
    }

    if (Date.now() - obj.ts > STATE_TTL_MS) {
      return null;
    }

    const payload = `${obj.platform}:${obj.nonce}:${obj.ts}:${obj.codeVerifier}`;
    const expectedSig = sign(payload);
    if (!safeCompare(obj.sig, expectedSig)) {
      return null;
    }

    return { codeVerifier: obj.codeVerifier };
  } catch {
    return null;
  }
}
