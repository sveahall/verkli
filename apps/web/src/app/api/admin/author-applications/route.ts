import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerEnv } from "@/lib/env";
import {
  apiError,
  E_APPLICATIONS_LOAD_FAILED,
  E_USER_ID_REQUIRED,
  E_INVALID_STATUS_VALUE,
  E_APPLICATION_UPDATE_FAILED,
  E_APPLICATION_CREATION_FAILED,
} from "@/lib/api-errors";
import { requireAdminRoleForApi } from "@/lib/admin-auth";
import {
  buildApplicationStatusSubject,
  buildApplicationStatusHtml,
} from "@/lib/emails/author-application-status";

const VALID_STATUSES = new Set(["approved", "rejected"] as const);
type ApplicationRow = {
  user_id: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  has_published_before: boolean | null;
  published_books_url: string | null;
  motivation: string | null;
  writing_background: string | null;
  work_samples: string | null;
};
type UserRow = {
  id: string;
  email: string | null;
};

export async function GET() {
  const { response } = await requireAdminRoleForApi();
  if (response) return response;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("author_applications" as never)
    .select("user_id, status, created_at, first_name, last_name, email, has_published_before, published_books_url, motivation, writing_background, work_samples")
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
    auth_email: emailByUserId.get(application.user_id) ?? null,
  }));

  return NextResponse.json({ applications });
}

export async function PATCH(request: Request) {
  const { user: adminUser, response } = await requireAdminRoleForApi();
  if (response || !adminUser) return response ?? apiError("UNAUTHORIZED", 401);

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

  // Keep profiles.role in sync so downstream queries that filter on role (the
  // discover page, reader/authors/[id], etc.) include the newly approved user
  // without a second manual promotion step.
  if (status === "approved") {
    const { error: roleSyncError } = await admin
      .from("profiles")
      .update({ role: "author" })
      .eq("user_id", userId)
      .neq("role", "admin");
    if (roleSyncError) {
      console.error("[author applications admin] profile role sync failed", {
        userId,
        message: roleSyncError.message,
      });
    }
  }

  // Audit trail: record who approved/rejected which application so admin
  // actions are non-repudiable. Best-effort — wrapped so a missing table
  // (test environments, early deploys before the audit_log migration) or a
  // transient DB error cannot take down the admin action itself.
  try {
    const { error: auditError } = await admin.from("audit_log").insert({
      entity_type: "author_application",
      entity_id: userId,
      action: status === "approved" ? "approve" : "reject",
      actor_user_id: adminUser.id,
      actor_role: "admin",
      meta: { status },
    });
    if (auditError) {
      console.error("[author applications admin] audit log insert failed", {
        userId,
        adminUserId: adminUser.id,
        status,
        message: auditError.message,
      });
    }
  } catch (auditError) {
    console.error("[author applications admin] audit log insert threw", {
      userId,
      adminUserId: adminUser.id,
      status,
      message:
        auditError instanceof Error ? auditError.message : String(auditError),
    });
  }

  // Send notification email (best-effort, don't fail the request)
  let emailSent = false;
  try {
    const { data: application } = await admin
      .from("author_applications" as never)
      .select("email, first_name")
      .eq("user_id", userId)
      .maybeSingle();

    const app = application as { email?: string | null; first_name?: string | null } | null;
    const recipientEmail = app?.email;

    if (recipientEmail) {
      const env = getServerEnv();
      const decision = status as "approved" | "rejected";
      const subject = buildApplicationStatusSubject({ decision, firstName: app?.first_name });
      const html = buildApplicationStatusHtml({ decision, firstName: app?.first_name });

      const resend = new Resend(env.RESEND_API_KEY);
      const { error: sendError } = await resend.emails.send({
        from: env.RESEND_FROM_EMAIL,
        to: recipientEmail,
        subject,
        html,
      });

      if (sendError) {
        console.error("[author applications admin] email send failed", {
          userId,
          email: recipientEmail,
          error: sendError.message,
        });
      } else {
        emailSent = true;
      }
    } else {
      console.warn("[author applications admin] no email on application, skipping notification", { userId });
    }
  } catch (err) {
    console.error("[author applications admin] email send exception", {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return NextResponse.json({ ok: true, userId, status, emailSent });
}
