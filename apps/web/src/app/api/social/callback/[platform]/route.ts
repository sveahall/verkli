import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSocialEnabled } from "@/lib/flags";
import {
  apiError,
  E_NOT_AUTHENTICATED,
  E_SOCIAL_FEATURE_DISABLED,
  E_SOCIAL_INVALID_STATE,
  E_SOCIAL_INVALID_PLATFORM,
  E_SOCIAL_OAUTH_FAILED,
} from "@/lib/api-errors";
import { VALID_PLATFORMS } from "@/lib/social/platform-constraints";
import { verifyOAuthState } from "@/lib/social/oauth-state";
import { exchangeCodeForTokens } from "@/lib/social/oauth";
import { encryptToken } from "@/lib/social/token-crypto";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ platform: string }> }
) {
  if (!isSocialEnabled()) {
    return apiError(E_SOCIAL_FEATURE_DISABLED, 403);
  }

  const { platform } = await params;
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    return apiError(E_SOCIAL_INVALID_STATE, 403);
  }

  if (!VALID_PLATFORMS.includes(platform) || platform === "email") {
    return apiError(E_SOCIAL_INVALID_PLATFORM, 400);
  }

  // 1. Require active Supabase auth session
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return apiError(E_NOT_AUTHENTICATED, 401);
  }

  // 2. Verify HMAC-signed state
  const verified = verifyOAuthState(state);
  if (!verified) {
    return apiError(E_SOCIAL_INVALID_STATE, 403);
  }

  // 3. HARD CHECK: state.userId MUST match session user.id
  if (verified.userId !== user.id) {
    return apiError(E_SOCIAL_INVALID_STATE, 403);
  }

  // 4. HARD CHECK: state.platform MUST match [platform] URL param
  if (verified.platform !== platform) {
    return apiError(E_SOCIAL_INVALID_STATE, 403);
  }

  // 5. Exchange code for tokens
  const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL?.trim() || url.origin;
  const redirectUri = `${siteOrigin}/api/social/callback/${platform}`;

  let tokens;
  try {
    tokens = await exchangeCodeForTokens(platform, code, redirectUri, verified.codeVerifier);
  } catch (err) {
    console.error("[social callback] token exchange failed", {
      userId: user.id,
      platform,
      message: err instanceof Error ? err.message : String(err),
    });
    return apiError(E_SOCIAL_OAUTH_FAILED, 500);
  }

  // 6. Encrypt tokens and store via admin client
  const admin = createAdminClient();
  const accessTokenEnc = encryptToken(tokens.accessToken);
  const refreshTokenEnc = tokens.refreshToken ? encryptToken(tokens.refreshToken) : null;
  const tokenExpiresAt = tokens.expiresIn
    ? new Date(Date.now() + tokens.expiresIn * 1000).toISOString()
    : null;

  const { error: upsertError } = await admin
    .from("social_connections" as never)
    .upsert(
      {
        user_id: user.id,
        platform,
        access_token_enc: accessTokenEnc,
        refresh_token_enc: refreshTokenEnc,
        token_expires_at: tokenExpiresAt,
        platform_user_id: tokens.platformUserId ?? null,
        platform_username: tokens.platformUsername ?? null,
        status: "active",
        connected_at: new Date().toISOString(),
      },
      { onConflict: "user_id,platform" }
    );

  if (upsertError) {
    console.error("[social callback] connection save failed", {
      userId: user.id,
      platform,
      message: upsertError.message,
      code: upsertError.code,
    });
    return apiError(E_SOCIAL_OAUTH_FAILED, 500);
  }

  // 7. Redirect to hardcoded path — NO user-controlled redirect
  return NextResponse.redirect(new URL("/author/settings", siteOrigin));
}
