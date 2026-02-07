import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const VALID_STATUSES = new Set(["approved", "rejected"] as const);

function isAdmin(request: Request): boolean {
  const adminKey = process.env.ADMIN_API_KEY?.trim();
  const key = request.headers.get("x-admin-key")?.trim();
  return Boolean(adminKey && key && key === adminKey);
}

export async function GET(request: Request) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("author_applications" as never)
    .select("user_id, status, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Failed to load applications" }, { status: 500 });
  }

  return NextResponse.json({ applications: data ?? [] });
}

export async function PATCH(request: Request) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
  const status = typeof body?.status === "string" ? body.status.trim().toLowerCase() : "";

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  if (!VALID_STATUSES.has(status as "approved" | "rejected")) {
    return NextResponse.json({ error: "status must be approved or rejected" }, { status: 400 });
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
      return NextResponse.json({ error: "Failed to update application" }, { status: 500 });
    }
  } else {
    const { error } = await admin
      .from("author_applications" as never)
      .insert({ user_id: userId, status } as never);

    if (error) {
      return NextResponse.json({ error: "Failed to create application decision" }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, userId, status });
}
