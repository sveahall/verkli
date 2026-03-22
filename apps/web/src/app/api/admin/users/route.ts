import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkAdmin } from "@/lib/admin-auth";
import { apiError, E_DATABASE_ERROR } from "@/lib/api-errors";

export async function GET(request: Request) {
  const denied = checkAdmin(request);
  if (denied) return denied;

  const url = new URL(request.url);
  const search = url.searchParams.get("q")?.trim() ?? "";
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const limit = 50;
  const offset = (page - 1) * limit;

  const admin = createAdminClient();

  let query = admin
    .from("profiles")
    .select("user_id, role, display_name, username, created_at, preferences", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (search) {
    // Escape LIKE wildcards to prevent filter injection
    const safe = search.replace(/[%_\\]/g, "\\$&");
    query = query.or(`display_name.ilike.%${safe}%,username.ilike.%${safe}%`);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error("[admin/users] load failed:", error.message);
    return apiError(E_DATABASE_ERROR, 500);
  }

  // Fetch emails from users table
  const userIds = (data ?? []).map((p) => p.user_id as string);
  const emailMap = new Map<string, string | null>();

  if (userIds.length > 0) {
    const { data: users } = await admin
      .from("users" as never)
      .select("id, email")
      .in("id", userIds as never);

    for (const u of (users ?? []) as Array<{ id: string; email: string | null }>) {
      emailMap.set(u.id, u.email);
    }
  }

  const users = (data ?? []).map((p) => ({
    user_id: p.user_id,
    email: emailMap.get(p.user_id as string) ?? null,
    role: p.role,
    display_name: p.display_name,
    username: p.username,
    created_at: p.created_at,
    beta_enabled: ((p.preferences as Record<string, unknown> | null)?.beta_enabled as boolean) ?? false,
  }));

  return NextResponse.json({ users, total: count ?? 0, page, limit });
}

export async function PATCH(request: Request) {
  const denied = checkAdmin(request);
  if (denied) return denied;

  const body = await request.json().catch(() => null);
  const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
  const betaEnabled = typeof body?.betaEnabled === "boolean" ? body.betaEnabled : undefined;

  if (!userId) {
    return apiError("USER_ID_REQUIRED", 400);
  }

  const admin = createAdminClient();

  if (betaEnabled !== undefined) {
    // Update beta_enabled in user_flags table
    const { error } = await admin
      .from("user_flags" as never)
      .upsert({ user_id: userId, beta_enabled: betaEnabled } as never, {
        onConflict: "user_id",
      });

    if (error) {
      console.error("[admin/users] beta flag update failed:", error.message);
      return apiError(E_DATABASE_ERROR, 500);
    }
  }

  return NextResponse.json({ ok: true, userId });
}
