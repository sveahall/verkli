import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildOAuthUrl } from "./oauth";

describe("oauth helpers", () => {
  it("builds X OAuth URLs with S256 PKCE", () => {
    process.env.X_CLIENT_ID = "client-123";

    const codeVerifier = "verifier-123";
    const authUrl = buildOAuthUrl(
      "x",
      "https://verkli.example.com/api/social/callback/x",
      "signed-state",
      codeVerifier,
    );

    const url = new URL(authUrl);
    const expectedChallenge = crypto
      .createHash("sha256")
      .update(codeVerifier)
      .digest("base64url");

    expect(url.searchParams.get("client_id")).toBe("client-123");
    expect(url.searchParams.get("state")).toBe("signed-state");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe(expectedChallenge);
  });
});
