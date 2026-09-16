import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserEmailMap } from "@/lib/admin/user-emails";
import {
  apiError,
  E_FEEDBACK_LOAD_FAILED,
  E_FEEDBACK_SAVE_FAILED,
  E_INVALID_JSON,
  E_RATE_LIMIT_EXCEEDED,
  E_VALIDATION_FAILED,
} from "@/lib/api-errors";
import { requireAdminRoleForApi } from "@/lib/admin-auth";
import { createPerUserRateLimiter } from "@/lib/rate-limit";

const PAGE_SIZE = 50;
const statusSchema = z.enum(["new", "triaged", "done"]);
const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  status: z.enum(["all", "new", "triaged", "done"]).default("all"),
}).strict();
const updateSchema = z.object({
  id: z.string().uuid(),
  status: statusSchema,
  expectedStatus: statusSchema,
}).strict();
const statusLimiter = createPerUserRateLimiter({ name: "support-queue-status", maxPerMinute: 30 });

export async function GET(request: Request) {
  const { response } = await requireAdminRoleForApi();
  if (response) return response;

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return apiError(E_VALIDATION_FAILED, 400);
  const { page, status } = parsed.data;

  try {
    const admin = createAdminClient();
    let query = admin.from("feedback")
      .select("id, user_id, type, message, url, request_id, status, created_at", { count: "exact" });
    if (status !== "all") query = query.eq("status", status);
    const { data, count, error } = await query
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
    if (error) throw error;

    const rows = data ?? [];
    const userIds = [...new Set(rows.flatMap((row) => row.user_id ? [row.user_id] : []))];
    let emails = new Map<string, string>();
    try {
      emails = await getUserEmailMap(userIds);
    } catch (error) {
      console.warn("[support queue] email lookup failed", { error });
    }
    return NextResponse.json({
      feedback: rows.map((row) => ({ ...row, auth_email: row.user_id ? emails.get(row.user_id) ?? null : null })),
      total: count ?? 0,
      page,
      pageSize: PAGE_SIZE,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[support queue] load failed", { page, status, error });
    return apiError(E_FEEDBACK_LOAD_FAILED, 500);
  }
}

export async function PATCH(request: Request) {
  const { user, response } = await requireAdminRoleForApi();
  if (response) return response;

  try {
    const limit = await statusLimiter.check(user.id);
    if (!limit.allowed) return apiError(E_RATE_LIMIT_EXCEEDED, 429, { retryAfterSeconds: limit.retryAfterSeconds });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError(E_INVALID_JSON, 400);
    }
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) return apiError(E_VALIDATION_FAILED, 400);
    const { id, status, expectedStatus } = parsed.data;

    const admin = createAdminClient();
    // Compare and set in one statement: a stale queue must never overwrite a
    // status another administrator has already changed.
    const { data, error } = await admin.from("feedback")
      .update({ status })
      .eq("id", id)
      .eq("status", expectedStatus)
      .select("id, status")
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      const { data: existing, error: lookupError } = await admin.from("feedback")
        .select("id").eq("id", id).maybeSingle();
      if (lookupError) throw lookupError;
      console.warn("[support queue] status update rejected", { id, adminId: user.id, reason: existing ? "conflict" : "missing" });
      return existing
        ? apiError("FEEDBACK_STATUS_CONFLICT", 409)
        : apiError("FEEDBACK_NOT_FOUND", 404);
    }
    console.info("[support queue] status updated", { id, adminId: user.id, previousStatus: expectedStatus, status });
    return NextResponse.json({ feedback: data });
  } catch (error) {
    console.error("[support queue] status update failed", { adminId: user.id, error });
    return apiError(E_FEEDBACK_SAVE_FAILED, 500);
  }
}
