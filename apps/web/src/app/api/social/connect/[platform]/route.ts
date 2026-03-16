import { NextResponse } from "next/server";
import { isSocialEnabled } from "@/lib/flags";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { requireProBillingForApi } from "@/lib/billing/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  apiError,
  E_SOCIAL_FEATURE_DISABLED,
  E_SOCIAL_INVALID_PLATFORM,
  E_SOCIAL_ALREADY_CONNECTED,
  E_SOCIAL_OAUTH_FAILED,
  E_RATE_LIMIT_EXCEEDED,
} from "@/lib/api-errors";
import { VALID_PLATFORMS } from "@/lib/social/platform-constraints";
import { buildOAuthUrl } from "@/lib/social/oauth";
import { createOAuthState } from "@/lib/social/oauth-state";
import { encryptToken } from "@/lib/social/token-crypto";
import { checkConnectRateLimit } from "@/lib/social/rate-limit";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ platform: string }> }
) {
  if (!isSocialEnabled()) {
    return apiError(E_SOCIAL_FEATURE_DISABLED, 403);
  }

  const { user, response } = await requireAuthorRoleForApi();
  if (response) return response;

  const proGate = await requireProBillingForApi(user.id);
  if (!proGate.ok) return proGate.response;

  const rl = await checkConnectRateLimit(user.id);
  if (!rl.allowed) {
    return apiError(E_RATE_LIMIT_EXCEEDED, 429, {
      retryAfterSeconds: rl.retryAfterSeconds,
    });
  }

  const { platform } = await params;

  if (!VALID_PLATFORMS.includes(platform)) {
    return apiError(E_SOCIAL_INVALID_PLATFORM, 400);
  }

  // Check for existing active connection
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("social_connections" as never)
    .select("id, status")
    .eq("user_id", user.id)
    .eq("platform", platform)
    .eq("status", "active")
    .maybeSingle();

  if (existing) {
    return apiError(E_SOCIAL_ALREADY_CONNECTED, 409);
  }

  // Email platform: store encrypted config directly
  if (platform === "email") {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return apiError("INVALID_REQUEST_BODY", 400);
    }
    const { smtpHost, smtpPort, smtpUser, smtpPass, fromEmail } = body as Record<string, string>;
    if (!smtpHost || !smtpPort || !smtpUser || !smtpPass || !fromEmail) {
      return apiError("INVALID_REQUEST_BODY", 400);
    }

    const emailConfig = JSON.stringify({ smtpHost, smtpPort, smtpUser, smtpPass, fromEmail });
    const encryptedConfig = encryptToken(emailConfig);

    const { error: saveError } = await admin
      .from("social_connections" as never)
      .upsert(
        {
          user_id: user.id,
          platform: "email",
          email_config_enc: encryptedConfig,
          platform_username: fromEmail,
          status: "active",
          connected_at: new Date().toISOString(),
        },
        { onConflict: "user_id,platform" }
      );

    if (saveError) {
      console.error("[social connect] email config save failed", {
        userId: user.id,
        platform,
        message: saveError.message,
        code: saveError.code,
      });
      return apiError(E_SOCIAL_OAUTH_FAILED, 500);
    }

    return NextResponse.json({ ok: true, platform: "email" });
  }

  // OAuth platforms: build auth URL
  const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL?.trim() || new URL(request.url).origin;
  const redirectUri = `${siteOrigin}/api/social/callback/${platform}`;
  const { state, codeVerifier } = createOAuthState(user.id, platform);
  const authUrl = buildOAuthUrl(platform, redirectUri, state, codeVerifier);

  return NextResponse.json({ authUrl });
}
