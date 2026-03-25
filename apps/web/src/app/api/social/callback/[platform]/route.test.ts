import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createOAuthPkceCookieValue,
  createOAuthState,
  getOAuthPkceCookieName,
} from "@/lib/social/oauth-state";

const mockGetUser = vi.fn();
const mockUpsert = vi.fn();
const mockExchangeCodeForTokens = vi.fn();
const mockEncryptToken = vi.fn((value: string) => `enc:${value}`);

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
    },
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn().mockReturnValue({
      upsert: mockUpsert,
    }),
  })),
}));

vi.mock("@/lib/social/oauth", () => ({
  exchangeCodeForTokens: mockExchangeCodeForTokens,
}));

vi.mock("@/lib/social/token-crypto", () => ({
  encryptToken: mockEncryptToken,
}));

const { GET } = await import("./route");

function makeRequest(input: {
  platform?: string;
  state: string;
  cookieValue?: string;
  code?: string;
}) {
  const platform = input.platform ?? "x";
  const code = input.code ?? "auth-code";
  const headers = new Headers();

  if (input.cookieValue) {
    headers.set(
      "cookie",
      `${getOAuthPkceCookieName(platform)}=${encodeURIComponent(input.cookieValue)}`
    );
  }

  return [
    new Request(
      `http://localhost/api/social/callback/${platform}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(input.state)}`,
      { headers }
    ),
    { params: Promise.resolve({ platform }) },
  ] as const;
}

describe("GET /api/social/callback/[platform]", () => {
  const originalSocialEnabled = process.env.SOCIAL_ENABLED;
  const originalNextPublicSocialEnabled = process.env.NEXT_PUBLIC_SOCIAL_ENABLED;
  const originalStateSecret = process.env.SOCIAL_OAUTH_STATE_SECRET;
  const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SOCIAL_ENABLED = "true";
    process.env.NEXT_PUBLIC_SOCIAL_ENABLED = "true";
    process.env.SOCIAL_OAUTH_STATE_SECRET = "test-social-oauth-secret";
    delete process.env.NEXT_PUBLIC_SITE_URL;

    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: "user-1",
        },
      },
    });
    mockExchangeCodeForTokens.mockResolvedValue({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresIn: 3600,
      platformUserId: "platform-user-1",
      platformUsername: "@verkli",
    });
    mockUpsert.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    if (originalSocialEnabled === undefined) {
      delete process.env.SOCIAL_ENABLED;
    } else {
      process.env.SOCIAL_ENABLED = originalSocialEnabled;
    }

    if (originalNextPublicSocialEnabled === undefined) {
      delete process.env.NEXT_PUBLIC_SOCIAL_ENABLED;
    } else {
      process.env.NEXT_PUBLIC_SOCIAL_ENABLED = originalNextPublicSocialEnabled;
    }

    if (originalStateSecret === undefined) {
      delete process.env.SOCIAL_OAUTH_STATE_SECRET;
    } else {
      process.env.SOCIAL_OAUTH_STATE_SECRET = originalStateSecret;
    }

    if (originalSiteUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SITE_URL;
    } else {
      process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
    }
  });

  it("uses the signed PKCE cookie instead of trusting the verifier in state", async () => {
    const created = createOAuthState("user-1", "x");
    const cookieValue = createOAuthPkceCookieValue({
      platform: "x",
      nonce: created.nonce,
      codeVerifier: created.codeVerifier,
    });
    const [req, ctx] = makeRequest({
      state: created.state,
      cookieValue,
    });

    const res = await GET(req, ctx);

    expect(mockExchangeCodeForTokens).toHaveBeenCalledWith(
      "x",
      "auth-code",
      "http://localhost/api/social/callback/x",
      created.codeVerifier
    );
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/author/settings");
    expect(res.headers.get("set-cookie") ?? "").toContain(
      `${getOAuthPkceCookieName("x")}=`
    );
    expect(res.headers.get("set-cookie") ?? "").toContain("Max-Age=0");
  });

  it("returns 403 when the PKCE cookie is missing", async () => {
    const created = createOAuthState("user-1", "x");
    const [req, ctx] = makeRequest({
      state: created.state,
    });

    const res = await GET(req, ctx);
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe("SOCIAL_INVALID_STATE");
    expect(mockExchangeCodeForTokens).not.toHaveBeenCalled();
  });
});
