import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminRoleForApi } from "@/lib/admin-auth";
import { apiError, E_DATABASE_ERROR, E_INVALID_USER_ID, isValidUuid } from "@/lib/api-errors";
import { logAnalyticsEvent } from "@/lib/analytics/events";

export async function GET(request: Request) {
  const { response } = await requireAdminRoleForApi();
  if (response) return response;

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

const MANAGEABLE_ROLES = new Set(["reader", "author"]);

export async function PATCH(request: Request) {
  const { user: adminUser, response } = await requireAdminRoleForApi();
  if (response || !adminUser) return response ?? apiError("UNAUTHORIZED", 401);

  const body = await request.json().catch(() => null);
  const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
  const betaEnabled = typeof body?.betaEnabled === "boolean" ? body.betaEnabled : undefined;
  const roleRaw = typeof body?.role === "string" ? body.role.trim().toLowerCase() : undefined;

  if (!userId) {
    return apiError("USER_ID_REQUIRED", 400);
  }
  if (!isValidUuid(userId)) {
    return apiError(E_INVALID_USER_ID, 400);
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

    // Cohort funnel metric: beta_granted (only on grant, not on revoke).
    // logAnalyticsEvent self-logs failures via console.error.
    if (betaEnabled) {
      await logAnalyticsEvent(admin, {
        eventType: "beta_granted",
        userId,
        path: "/admin/users",
        props: { actor_user_id: adminUser.id },
      });
    }

    // Audit log — best-effort, mirror the author-applications flow.
    try {
      await admin.from("audit_log").insert({
        entity_type: "user",
        entity_id: userId,
        action: betaEnabled ? "beta_enable" : "beta_disable",
        actor_user_id: adminUser.id,
        actor_role: "admin",
        meta: { beta_enabled: betaEnabled },
      });
    } catch (auditError) {
      console.error("[admin/users] audit log insert failed", {
        userId,
        adminUserId: adminUser.id,
        message:
          auditError instanceof Error ? auditError.message : String(auditError),
      });
    }
  }

  if (roleRaw !== undefined) {
    // Admins may flip between reader ⇄ author. Promotions/demotions to
    // "admin" go through a separate controlled path — admin creation is
    // intentionally not self-service from this endpoint.
    if (!MANAGEABLE_ROLES.has(roleRaw)) {
      return apiError("VALIDATION_FAILED", 400);
    }
    if (userId === adminUser.id) {
      return apiError("FORBIDDEN", 403);
    }

    // Refuse to demote another admin via this endpoint.
    const { data: existingProfile } = await admin
      .from("profiles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();
    const existingRole = String(existingProfile?.role ?? "").trim().toLowerCase();
    if (existingRole === "admin") {
      return apiError("FORBIDDEN", 403);
    }

    const { error: roleError } = await admin
      .from("profiles")
      .update({ role: roleRaw })
      .eq("user_id", userId);

    if (roleError) {
      console.error("[admin/users] role update failed", {
        userId,
        role: roleRaw,
        message: roleError.message,
      });
      return apiError(E_DATABASE_ERROR, 500);
    }

    try {
      await admin.from("audit_log").insert({
        entity_type: "user",
        entity_id: userId,
        action: "role_change",
        actor_user_id: adminUser.id,
        actor_role: "admin",
        meta: { from: existingRole || null, to: roleRaw },
      });
    } catch (auditError) {
      console.error("[admin/users] audit log insert failed", {
        userId,
        adminUserId: adminUser.id,
        message:
          auditError instanceof Error ? auditError.message : String(auditError),
      });
    }
  }

  return NextResponse.json({ ok: true, userId });
}
