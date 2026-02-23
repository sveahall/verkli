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
type ApplicationRow = {
  user_id: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
};
type UserRow = {
  id: string;
  email: string | null;
};

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
    console.error("[author applications admin] failed to load applications", {
      message: error.message,
    });
    return apiError(E_APPLICATIONS_LOAD_FAILED, 500);
  }

  const applicationsData = (data ?? []) as ApplicationRow[];
  const userIds = applicationsData.map((application) => application.user_id);
  const emailByUserId = new Map<string, string | null>();

  if (userIds.length > 0) {
    const { data: users, error: usersError } = await admin
      .from("users" as never)
      .select("id, email")
      .in("id", userIds as never);

    if (usersError) {
      console.error("[author applications admin] failed to load user emails", {
        message: usersError.message,
      });
    } else {
      for (const user of (users ?? []) as UserRow[]) {
        emailByUserId.set(user.id, user.email ?? null);
      }
    }
  }

  const applications = applicationsData.map((application) => ({
    ...application,
    email: emailByUserId.get(application.user_id) ?? null,
  }));

  return NextResponse.json({ applications });
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
      console.error("[author applications admin] failed to update application", {
        userId,
        status,
        message: error.message,
      });
      return apiError(E_APPLICATION_UPDATE_FAILED, 500);
    }
  } else {
    const { error } = await admin
      .from("author_applications" as never)
      .insert({ user_id: userId, status } as never);

    if (error) {
      console.error("[author applications admin] failed to create application", {
        userId,
        status,
        message: error.message,
      });
      return apiError(E_APPLICATION_CREATION_FAILED, 500);
    }
  }

  return NextResponse.json({ ok: true, userId, status });
}
