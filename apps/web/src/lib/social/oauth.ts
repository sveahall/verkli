/**
 * OAuth helpers for social media platforms.
 * Handles authorization URL building, code exchange, token refresh, and revocation.
 */

type TokenResponse = {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  platformUserId?: string;
  platformUsername?: string;
};

function getInstagramConfig() {
  return {
    clientId: process.env.INSTAGRAM_CLIENT_ID ?? "",
    clientSecret: process.env.INSTAGRAM_CLIENT_SECRET ?? "",
  };
}

function getTikTokConfig() {
  return {
    clientKey: process.env.TIKTOK_CLIENT_KEY ?? "",
    clientSecret: process.env.TIKTOK_CLIENT_SECRET ?? "",
  };
}

function getXConfig() {
  return {
    clientId: process.env.X_CLIENT_ID ?? "",
    clientSecret: process.env.X_CLIENT_SECRET ?? "",
  };
}

export function buildOAuthUrl(
  platform: string,
  redirectUri: string,
  state: string
): string {
  switch (platform) {
    case "instagram": {
      const { clientId } = getInstagramConfig();
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: "instagram_basic,instagram_content_publish",
        response_type: "code",
        state,
      });
      return `https://api.instagram.com/oauth/authorize?${params}`;
    }
    case "tiktok": {
      const { clientKey } = getTikTokConfig();
      const params = new URLSearchParams({
        client_key: clientKey,
        redirect_uri: redirectUri,
        scope: "video.publish",
        response_type: "code",
        state,
      });
      return `https://www.tiktok.com/v2/auth/authorize/?${params}`;
    }
    case "x": {
      const { clientId } = getXConfig();
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: "tweet.read tweet.write users.read offline.access",
        response_type: "code",
        state,
        code_challenge: "challenge",
        code_challenge_method: "plain",
      });
      return `https://twitter.com/i/oauth2/authorize?${params}`;
    }
    default:
      throw new Error(`Unsupported OAuth platform: ${platform}`);
  }
}

export async function exchangeCodeForTokens(
  platform: string,
  code: string,
  redirectUri: string
): Promise<TokenResponse> {
  switch (platform) {
    case "instagram": {
      const { clientId, clientSecret } = getInstagramConfig();
      const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        code,
      });
      const res = await fetch("https://api.instagram.com/oauth/access_token", {
        method: "POST",
        body,
      });
      if (!res.ok) throw new Error(`Instagram token exchange failed: ${res.status}`);
      const data = (await res.json()) as Record<string, unknown>;
      return {
        accessToken: String(data.access_token ?? ""),
        platformUserId: String(data.user_id ?? ""),
      };
    }
    case "tiktok": {
      const { clientKey, clientSecret } = getTikTokConfig();
      const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_key: clientKey,
          client_secret: clientSecret,
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
          code,
        }),
      });
      if (!res.ok) throw new Error(`TikTok token exchange failed: ${res.status}`);
      const data = (await res.json()) as Record<string, unknown>;
      return {
        accessToken: String(data.access_token ?? ""),
        refreshToken: data.refresh_token ? String(data.refresh_token) : undefined,
        expiresIn: typeof data.expires_in === "number" ? data.expires_in : undefined,
        platformUserId: String(data.open_id ?? ""),
      };
    }
    case "x": {
      const { clientId, clientSecret } = getXConfig();
      const res = await fetch("https://api.twitter.com/2/oauth2/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
          code,
          code_verifier: "challenge",
        }),
      });
      if (!res.ok) throw new Error(`X token exchange failed: ${res.status}`);
      const data = (await res.json()) as Record<string, unknown>;
      return {
        accessToken: String(data.access_token ?? ""),
        refreshToken: data.refresh_token ? String(data.refresh_token) : undefined,
        expiresIn: typeof data.expires_in === "number" ? data.expires_in : undefined,
      };
    }
    default:
      throw new Error(`Unsupported OAuth platform: ${platform}`);
  }
}

export async function refreshAccessToken(
  platform: string,
  refreshToken: string
): Promise<TokenResponse> {
  switch (platform) {
    case "x": {
      const { clientId, clientSecret } = getXConfig();
      const res = await fetch("https://api.twitter.com/2/oauth2/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }),
      });
      if (!res.ok) throw new Error(`X token refresh failed: ${res.status}`);
      const data = (await res.json()) as Record<string, unknown>;
      return {
        accessToken: String(data.access_token ?? ""),
        refreshToken: data.refresh_token ? String(data.refresh_token) : undefined,
        expiresIn: typeof data.expires_in === "number" ? data.expires_in : undefined,
      };
    }
    case "tiktok": {
      const { clientKey, clientSecret } = getTikTokConfig();
      const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_key: clientKey,
          client_secret: clientSecret,
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }),
      });
      if (!res.ok) throw new Error(`TikTok token refresh failed: ${res.status}`);
      const data = (await res.json()) as Record<string, unknown>;
      return {
        accessToken: String(data.access_token ?? ""),
        refreshToken: data.refresh_token ? String(data.refresh_token) : undefined,
        expiresIn: typeof data.expires_in === "number" ? data.expires_in : undefined,
      };
    }
    default:
      throw new Error(`Token refresh not supported for platform: ${platform}`);
  }
}

export async function revokeToken(
  platform: string,
  accessToken: string
): Promise<void> {
  switch (platform) {
    case "x": {
      const { clientId, clientSecret } = getXConfig();
      await fetch("https://api.twitter.com/2/oauth2/revoke", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        },
        body: new URLSearchParams({
          token: accessToken,
          token_type_hint: "access_token",
        }),
      });
      break;
    }
    case "tiktok": {
      const { clientKey, clientSecret } = getTikTokConfig();
      await fetch("https://open.tiktokapis.com/v2/oauth/revoke/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_key: clientKey,
          client_secret: clientSecret,
          token: accessToken,
        }),
      });
      break;
    }
    default:
      break;
  }
}
