import { beforeEach, describe, expect, it } from "vitest";
import {
  createOAuthPkceCookieValue,
  createOAuthState,
  verifyOAuthPkceCookieValue,
  verifyOAuthState,
} from "./oauth-state";

describe("oauth-state", () => {
  beforeEach(() => {
    process.env.SOCIAL_OAUTH_STATE_SECRET = "test-social-oauth-secret";
  });

  it("round-trips signed state without exposing the PKCE verifier", () => {
    const created = createOAuthState("user-1", "x");
    const verified = verifyOAuthState(created.state);

    expect(verified).toEqual({
      userId: "user-1",
      platform: "x",
      nonce: created.nonce,
    });
  });

  it("round-trips the PKCE verifier via signed cookie payload", () => {
    const created = createOAuthState("user-1", "x");
    const cookieValue = createOAuthPkceCookieValue({
      platform: "x",
      nonce: created.nonce,
      codeVerifier: created.codeVerifier,
    });

    const verified = verifyOAuthPkceCookieValue(cookieValue, {
      platform: "x",
      nonce: created.nonce,
    });

    expect(verified).toEqual({
      codeVerifier: created.codeVerifier,
    });
  });

  it("rejects tampered state payloads", () => {
    const created = createOAuthState("user-1", "x");
    const decoded = JSON.parse(Buffer.from(created.state, "base64url").toString("utf8")) as {
      userId: string;
      platform: string;
      ts: number;
      nonce: string;
      sig: string;
    };

    decoded.platform = "instagram";
    const tampered = Buffer.from(JSON.stringify(decoded)).toString("base64url");

    expect(verifyOAuthState(tampered)).toBeNull();
  });
});
