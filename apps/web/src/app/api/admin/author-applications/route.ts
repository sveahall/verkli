import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserEmailMap } from "@/lib/admin/user-emails";
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
import { ensureBetaAuthorAccess } from "@/lib/auth/beta";
import { sendBetaWelcome, type BetaDeliveryResult } from "@/lib/emails/beta-delivery";
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

export async function GET() {
  const { response } = await requireAdminRoleForApi();
  if (response) return response;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("author_applications")
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
  // Emails live in auth.users, not the empty public.users mirror.
  const emailByUserId = await getUserEmailMap(userIds);

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

  let existing: Pick<ApplicationRow, "user_id" | "first_name"> | null;
  try {
    const { data, error: lookupError } = await admin
      .from("author_applications")
      .select("user_id, first_name")
      .eq("user_id", userId)
      .maybeSingle();
    if (lookupError) throw new Error(lookupError.message);
    existing = data;
  } catch (error) {
    console.error("[author applications admin] application lookup failed", { userId, message: error instanceof Error ? error.message : String(error) });
    return apiError(E_APPLICATIONS_LOAD_FAILED, 500, { detail: "Could not verify the application. No decision was saved or email sent. Please retry." });
  }

  // Application contact details are editable; send account access only to the
  // canonical address attached to the authenticated account.
  let recipientEmail: string;
  try {
    const { data, error: userError } = await admin.auth.admin.getUserById(userId);
    if (userError || !data.user?.email?.trim()) {
      console.error("[author applications admin] account email lookup failed", { userId, message: userError?.message ?? "Account email missing" });
      return apiError(E_APPLICATION_UPDATE_FAILED, 500, { detail: "Could not verify the account email. No decision was saved or email sent. Please retry." });
    }
    recipientEmail = data.user.email.trim();
  } catch (error) {
    console.error("[author applications admin] account email lookup threw", { userId, message: error instanceof Error ? error.message : String(error) });
    return apiError(E_APPLICATION_UPDATE_FAILED, 500, { detail: "Could not verify the account email. No decision was saved or email sent. Please retry." });
  }

  if (existing) {
    const { error } = await admin
      .from("author_applications")
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
      .from("author_applications")
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

  // A saved decision alone does not establish author access or pass BETA_LOCK.
  // Do not announce approval until both grants are confirmed.
  if (status === "approved") {
    try {
      const access = await ensureBetaAuthorAccess(admin, userId);
      if (!access.ok) throw new Error(access.error);
    } catch (error) {
      console.error("[author applications admin] author beta access failed", { userId, message: error instanceof Error ? error.message : String(error) });
      return apiError(E_APPLICATION_UPDATE_FAILED, 500, { detail: "The approval was saved, but author beta access could not be enabled. No welcome email was sent. Please retry approval." });
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

  if (status === "approved") {
    const email = await sendBetaWelcome(admin, {
      actorId: adminUser.id,
      entityId: userId,
      email: recipientEmail,
      name: existing?.first_name,
      accountExists: true,
      audience: "author",
    });
    return NextResponse.json({ ok: true, userId, status, emailSent: email.status === "sent" || email.status === "already_sent", email });
  }

  // Rejections retain their existing notification, using the account address.
  let emailSent = false;
  let email: BetaDeliveryResult = { status: "unavailable", message: "The rejection was saved, but its notification email could not be sent." };
  try {
    const env = getServerEnv();
    const subject = buildApplicationStatusSubject({ decision: "rejected", firstName: existing?.first_name });
    const html = buildApplicationStatusHtml({ decision: "rejected", firstName: existing?.first_name });

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
      email = { status: "sent", message: "The rejection was saved and its notification email was accepted by the mail provider." };
    }
  } catch (err) {
    console.error("[author applications admin] email send exception", {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return NextResponse.json({ ok: true, userId, status, emailSent, email });
}
