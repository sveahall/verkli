import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  apiError,
  E_FORBIDDEN,
  E_FEEDBACK_LOAD_FAILED,
} from "@/lib/api-errors";

export async function GET(request: Request) {
  const adminKey = process.env.ADMIN_API_KEY?.trim();
  const key = request.headers.get("x-admin-key")?.trim();
  if (!adminKey || key !== adminKey) {
    return apiError(E_FORBIDDEN, 403);
  }

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
