import { beforeEach, describe, expect, it } from "vitest";
import { createOAuthState, verifyOAuthState } from "./oauth-state";

describe("oauth-state", () => {
  beforeEach(() => {
    process.env.SOCIAL_OAUTH_STATE_SECRET = "test-social-oauth-secret";
  });

  it("round-trips signed state including the PKCE verifier", () => {
    const created = createOAuthState("user-1", "x");
    const verified = verifyOAuthState(created.state);

    expect(verified).toEqual({
      userId: "user-1",
      platform: "x",
      codeVerifier: created.codeVerifier,
    });
  });

  it("rejects tampered state payloads", () => {
    const created = createOAuthState("user-1", "x");
    const decoded = JSON.parse(Buffer.from(created.state, "base64url").toString("utf8")) as {
      userId: string;
      platform: string;
      ts: number;
      codeVerifier: string;
      sig: string;
    };

    decoded.platform = "instagram";
    const tampered = Buffer.from(JSON.stringify(decoded)).toString("base64url");

    expect(verifyOAuthState(tampered)).toBeNull();
  });
});
