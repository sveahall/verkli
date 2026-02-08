import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  apiError,
  E_FORBIDDEN,
  E_APPLICATIONS_LOAD_FAILED,
  E_USER_ID_REQUIRED,
  E_INVALID_STATUS_VALUE,
  E_APPLICATION_UPDATE_FAILED,
  E_APPLICATION_CREATION_FAILED,
} from "@/lib/api-errors";

const VALID_STATUSES = new Set(["approved", "rejected"] as const);

function isAdmin(request: Request): boolean {
  const adminKey = process.env.ADMIN_API_KEY?.trim();
  const key = request.headers.get("x-admin-key")?.trim();
  return Boolean(adminKey && key && key === adminKey);
}

export async function GET(request: Request) {
  if (!isAdmin(request)) {
    return apiError(E_FORBIDDEN, 403);
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("author_applications" as never)
    .select("user_id, status, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return apiError(E_APPLICATIONS_LOAD_FAILED, 500);
  }

  return NextResponse.json({ applications: data ?? [] });
}

export async function PATCH(request: Request) {
  if (!isAdmin(request)) {
    return apiError(E_FORBIDDEN, 403);
  }

  const body = await request.json().catch(() => null);
  const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
  const status = typeof body?.status === "string" ? body.status.trim().toLowerCase() : "";

  if (!userId) {
    return apiError(E_USER_ID_REQUIRED, 400);
  }

  if (!VALID_STATUSES.has(status as "approved" | "rejected")) {
    return apiError(E_INVALID_STATUS_VALUE, 400);
  }

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("author_applications" as never)
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) {
    const { error } = await admin
      .from("author_applications" as never)
      .update({ status } as never)
      .eq("user_id", userId);

    if (error) {
      return apiError(E_APPLICATION_UPDATE_FAILED, 500);
    }
  } else {
    const { error } = await admin
      .from("author_applications" as never)
      .insert({ user_id: userId, status } as never);

    if (error) {
      return apiError(E_APPLICATION_CREATION_FAILED, 500);
    }
  }

  return NextResponse.json({ ok: true, userId, status });
}
