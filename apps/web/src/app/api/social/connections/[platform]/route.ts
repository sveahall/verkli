import { NextResponse } from "next/server";
import { isSocialEnabled } from "@/lib/flags";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { requireProBillingForApi } from "@/lib/billing/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  apiError,
  E_SOCIAL_FEATURE_DISABLED,
  E_SOCIAL_INVALID_PLATFORM,
  E_SOCIAL_PLATFORM_NOT_CONNECTED,
} from "@/lib/api-errors";
import { VALID_PLATFORMS } from "@/lib/social/platform-constraints";
import { decryptToken } from "@/lib/social/token-crypto";
import { revokeToken } from "@/lib/social/oauth";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ platform: string }> }
) {
  if (!isSocialEnabled()) {
    return apiError(E_SOCIAL_FEATURE_DISABLED, 403);
  }

  const { user, response } = await requireAuthorRoleForApi();
  if (response) return response;

  const proGate = await requireProBillingForApi(user.id);
  if (!proGate.ok) return proGate.response;

  const { platform } = await params;

  if (!VALID_PLATFORMS.includes(platform)) {
    return apiError(E_SOCIAL_INVALID_PLATFORM, 400);
  }

  const admin = createAdminClient();

  // Fetch connection (base table via admin)
  const { data: connection } = await admin
    .from("social_connections" as never)
    .select("id, access_token_enc, status")
    .eq("user_id", user.id)
    .eq("platform", platform)
    .maybeSingle();

  if (!connection) {
    return apiError(E_SOCIAL_PLATFORM_NOT_CONNECTED, 404);
  }

  const conn = connection as { id: string; access_token_enc: string | null; status: string };

  // Try to revoke token at platform level
  if (conn.access_token_enc && conn.status === "active") {
    try {
      const accessToken = decryptToken(conn.access_token_enc);
      await revokeToken(platform, accessToken);
    } catch (err) {
      console.warn("[social revoke] platform revocation failed:", err instanceof Error ? err.message : String(err));
    }
  }

  // Null out encrypted tokens and set status to revoked
  await admin
    .from("social_connections" as never)
    .update({
      access_token_enc: null,
      refresh_token_enc: null,
      email_config_enc: null,
      status: "revoked",
    })
    .eq("id", conn.id);

  return NextResponse.json({ ok: true, platform, status: "revoked" });
}
