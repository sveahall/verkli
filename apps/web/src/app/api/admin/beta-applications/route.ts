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

  const { data: application, error } = await supabase
    .from("beta_applications")
    .update(update)
    .eq("id", id)
    .select("waitlist_id")
    .maybeSingle();

  if (error) {
    console.error("ADMIN_BETA_APPLICATION_ERROR", {
      message: "update failed",
      code: error.code,
      details: error.message,
    });
    return apiError(E_GENERIC_ERROR, 500);
  }

  const invitation = await syncWaitlistInvitation(supabase, application?.waitlist_id ?? null, status as Status);

  return NextResponse.json({ ok: true, status, invitation });
}

/**
 * Make "accepted" mean the applicant is actually in.
 *
 * Accepting used to write a label and nothing else. It granted no access, sent
 * nothing, and — since 13 of the first 14 applicants had no account yet —
 * could not have granted `user_flags.beta_enabled` either, because that hangs
 * off a `user_id` that does not exist until they sign up.
 *
 * The waitlist is where an invitation can exist before an account does:
 * `beta_invited_at` authorises the first verified signup, which is what grants
 * beta (see `lib/auth/beta.ts`). `beta_applications.waitlist_id` already linked
 * the two rows; nothing used it.
 *
 * Reversing the decision clears the invitation again, so a mistaken accept
 * cannot leave a stranger able to sign straight into the cohort. It does not
 * touch anyone who already signed up: their `beta_enabled` is granted, and
 * taking that away is a separate, deliberate admin action.
 */
type InvitationResult =
  | { state: "invited" | "already_invited" | "withdrawn" | "not_invited" }
  | { state: "no_waitlist_row" }
  | { state: "failed" };

async function syncWaitlistInvitation(
  supabase: ReturnType<typeof createAdminClient>,
  waitlistId: string | null,
  status: Status
): Promise<InvitationResult> {
  if (!waitlistId) return { state: "no_waitlist_row" };

  const { data: row, error: readError } = await supabase
    .from("waitlist")
    .select("beta_invited_at")
    .eq("id", waitlistId)
    .maybeSingle();

  if (readError) {
    console.error("ADMIN_BETA_APPLICATION_ERROR", { message: "waitlist read failed", code: readError.code });
    return { state: "failed" };
  }
  if (!row) return { state: "no_waitlist_row" };

  const invited = row.beta_invited_at != null;
  const shouldBeInvited = status === "accepted";
  if (invited === shouldBeInvited) {
    return { state: shouldBeInvited ? "already_invited" : "not_invited" };
  }

  const { error: writeError } = await supabase
    .from("waitlist")
    .update({ beta_invited_at: shouldBeInvited ? new Date().toISOString() : null })
    .eq("id", waitlistId);

  if (writeError) {
    // The decision is recorded either way; the caller is told the invitation
    // half did not land rather than being left to assume it did.
    console.error("ADMIN_BETA_APPLICATION_ERROR", { message: "waitlist invitation write failed", code: writeError.code });
    return { state: "failed" };
  }

  return { state: shouldBeInvited ? "invited" : "withdrawn" };
}
