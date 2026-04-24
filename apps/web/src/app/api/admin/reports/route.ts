import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminRoleForApi } from "@/lib/admin-auth";
import {
  apiError,
  E_DATABASE_ERROR,
  E_VALIDATION_FAILED,
} from "@/lib/api-errors";

export const runtime = "nodejs";

const PATCH_STATUSES = ["pending", "reviewing", "actioned", "dismissed"] as const;

const patchSchema = z.object({
  reportId: z.string().uuid(),
  status: z.enum(PATCH_STATUSES),
});

/**
 * Admin triage list for the report-abuse queue. Paged, defaults to
 * pending rows. Authenticated admins only.
 */
export async function GET(request: Request) {
  const { response } = await requireAdminRoleForApi();
  if (response) return response;

  const url = new URL(request.url);
  const statusFilter = url.searchParams.get("status")?.trim() ?? "pending";
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const limit = 50;
  const offset = (page - 1) * limit;

  const admin = createAdminClient();

  let query = admin
    .from("content_reports")
    .select(
      "id, reporter_user_id, target_type, target_id, reason_code, detail, status, reviewed_by_user_id, reviewed_at, created_at",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (statusFilter && statusFilter !== "all") {
    if (!(PATCH_STATUSES as readonly string[]).includes(statusFilter)) {
      return apiError(E_VALIDATION_FAILED, 400);
    }
    query = query.eq("status", statusFilter);
  }

  const { data, error, count } = await query;
  if (error) {
    console.error("[admin/reports] load failed", { message: error.message });
    return apiError(E_DATABASE_ERROR, 500);
  }

  return NextResponse.json({
    reports: data ?? [],
    total: count ?? 0,
    page,
    limit,
  });
}

/**
 * Admin marks a report as reviewing / actioned / dismissed. Records the
 * reviewing admin and timestamp for audit. A best-effort audit_log row is
 * written so a trend of "all reports dismissed by admin X" is visible.
 */
export async function PATCH(request: Request) {
  const { user: adminUser, response } = await requireAdminRoleForApi();
  if (response || !adminUser) return response ?? apiError("UNAUTHORIZED", 401);

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(E_VALIDATION_FAILED, 400);
  }
  const { reportId, status } = parsed.data;

  const admin = createAdminClient();

  const { error } = await admin
    .from("content_reports")
    .update({
      status,
      reviewed_by_user_id: adminUser.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", reportId);

  if (error) {
    console.error("[admin/reports] update failed", {
      reportId,
      adminUserId: adminUser.id,
      message: error.message,
    });
    return apiError(E_DATABASE_ERROR, 500);
  }

  try {
    await admin.from("audit_log").insert({
      entity_type: "content_report",
      entity_id: reportId,
      action: `status_${status}`,
      actor_user_id: adminUser.id,
      actor_role: "admin",
      meta: { status },
    });
  } catch (auditError) {
    console.error("[admin/reports] audit log insert failed", {
      reportId,
      adminUserId: adminUser.id,
      message:
        auditError instanceof Error ? auditError.message : String(auditError),
    });
  }

  return NextResponse.json({ ok: true, reportId, status });
}
