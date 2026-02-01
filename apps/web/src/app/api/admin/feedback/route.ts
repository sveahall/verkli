import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const adminKey = process.env.ADMIN_API_KEY?.trim();
  const key = request.headers.get("x-admin-key")?.trim();
  if (!adminKey || key !== adminKey) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("feedback")
    .select("id, user_id, type, message, url, request_id, status, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Failed to load feedback" }, { status: 500 });
  }

  return NextResponse.json({ feedback: data ?? [] });
}
