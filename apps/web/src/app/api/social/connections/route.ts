import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSocialEnabled } from "@/lib/flags";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { requireProBillingForApi } from "@/lib/billing/server";
import {
  apiError,
  E_SOCIAL_FEATURE_DISABLED,
} from "@/lib/api-errors";

export async function GET() {
  if (!isSocialEnabled()) {
    return apiError(E_SOCIAL_FEATURE_DISABLED, 403);
  }

  const { user, response } = await requireAuthorRoleForApi();
  if (response) return response;

  const proGate = await requireProBillingForApi(user.id);
  if (!proGate.ok) return proGate.response;

  const supabase = await createClient();

  // Query the SAFE VIEW — no token columns exist in it.
  // RLS + view's WHERE user_id = auth.uid() filters automatically.
  const { data, error } = await supabase
    .from("social_connections_safe" as never)
    .select("id, platform, platform_username, status, token_expires_at, connected_at, updated_at");

  if (error) {
    console.error("[social connections] failed to list connections:", error.message);
    return apiError("DATABASE_ERROR", 500);
  }

  return NextResponse.json({ connections: data ?? [] });
}
