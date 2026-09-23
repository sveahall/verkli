import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminRoleForApi } from "@/lib/admin-auth";
import {
  apiError,
  E_INVALID_REQUEST_BODY,
  E_VALIDATION_FAILED,
  E_SERVER_CONFIG_ERROR,
  E_GENERIC_ERROR,
} from "@/lib/api-errors";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATUSES = ["pending", "accepted", "rejected"] as const;
type Status = (typeof STATUSES)[number];

export async function PATCH(request: Request) {
  const { response } = await requireAdminRoleForApi();
  if (response) return response;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return apiError(E_INVALID_REQUEST_BODY, 400);
  }

  const { id, status, note } = body as Record<string, unknown>;

  if (typeof id !== "string" || !UUID_REGEX.test(id)) {
    return apiError(E_VALIDATION_FAILED, 400, { field: "id" });
  }
  if (typeof status !== "string" || !STATUSES.includes(status as Status)) {
    return apiError(E_VALIDATION_FAILED, 400, { field: "status" });
  }
  if (note != null && (typeof note !== "string" || note.length > 2000)) {
    return apiError(E_VALIDATION_FAILED, 400, { field: "note" });
  }

  let supabase;
  try {
    supabase = createAdminClient();
  } catch {
    return apiError(E_SERVER_CONFIG_ERROR, 500);
  }

  const update = {
    status,
    reviewed_at: status === "pending" ? null : new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...(typeof note === "string" ? { review_note: note.trim() || null } : {}),
  };

  const { error } = await supabase
    .from("beta_applications")
    .update(update)
    .eq("id", id);

  if (error) {
    console.error("ADMIN_BETA_APPLICATION_ERROR", {
      message: "update failed",
      code: error.code,
      details: error.message,
    });
    return apiError(E_GENERIC_ERROR, 500);
  }

  return NextResponse.json({ ok: true, status });
}
