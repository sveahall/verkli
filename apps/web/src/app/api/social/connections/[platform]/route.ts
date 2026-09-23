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
  const { data: connection, error: readError } = await admin
    .from("social_connections")
    .select("id, access_token_enc, status, updated_at")
    .eq("user_id", user.id)
    .eq("platform", platform)
    .maybeSingle();

  if (readError) {
    console.error("[social disconnect] connection lookup failed", { platform, code: readError.code });
    return apiError("SOCIAL_DISCONNECT_FAILED", 500);
  }

  if (!connection) {
    return apiError(E_SOCIAL_PLATFORM_NOT_CONNECTED, 404);
  }

  const conn = connection as { id: string; access_token_enc: string | null; status: string; updated_at: string };

  // Null out encrypted tokens and set status to revoked
  const { data: saved, error: writeError } = await admin
    .from("social_connections")
    .update({
      access_token_enc: null,
      refresh_token_enc: null,
      email_config_enc: null,
      status: "revoked",
    })
    .eq("id", conn.id)
    .eq("user_id", user.id)
    .eq("updated_at", conn.updated_at)
    .select("id")
    .maybeSingle();

  if (writeError) {
    console.error("[social disconnect] local disconnect failed", { platform, code: writeError.code });
    return apiError("SOCIAL_DISCONNECT_FAILED", 500);
  }
  if (!saved) return apiError("SOCIAL_CONNECTION_CHANGED", 409);

  // Revoke only after local credentials are cleared. The existing provider
  // helper does not confirm HTTP success, so never report confirmed revocation.
  let providerRevocation = "not-requested";
  if (conn.access_token_enc && conn.status === "active") {
    try {
      await revokeToken(platform, decryptToken(conn.access_token_enc));
      providerRevocation = "requested";
    } catch {
      providerRevocation = "unconfirmed";
      console.warn("[social disconnect] platform revocation unconfirmed", { platform });
    }
  }

  return NextResponse.json({ ok: true, platform, status: "revoked", providerRevocation });
}
