import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError, E_FEEDBACK_LOAD_FAILED } from "@/lib/api-errors";
import { requireAdminRoleForApi } from "@/lib/admin-auth";

export async function GET() {
  const { response } = await requireAdminRoleForApi();
  if (response) return response;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("feedback")
    .select("id, user_id, type, message, url, request_id, status, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return apiError(E_FEEDBACK_LOAD_FAILED, 500);
  }

  return NextResponse.json({ feedback: data ?? [] });
}
