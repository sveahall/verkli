import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertServerEnv, getServerEnv } from "@/lib/env";
import { Resend } from "resend";
import {
  apiError,
  E_SERVER_CONFIG_ERROR,
  E_RATE_LIMIT_EXCEEDED,
  E_INVALID_REQUEST_BODY,
  E_INVALID_EMAIL,
  E_SIGNUP_VERIFICATION_FAILED,
  E_GENERIC_ERROR,
  E_WAITLIST_ADD_FAILED,
} from "@/lib/api-errors";
import { createPerUserRateLimiter } from "@/lib/rate-limit";
import { getClientIpFromRequest } from "@/lib/request-ip";
import { buildWaitlistHtml, buildWaitlistSubject } from "@/lib/emails/waitlist-confirmation";
import { logAnalyticsEvent } from "@/lib/analytics/events";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 10 signups per IP per 15 min. Backed by Redis when REDIS_URL is set so the
// budget is shared across serverless instances; falls back to in-memory only
// when Redis is unavailable.
const waitlistLimiter = createPerUserRateLimiter({
  maxPerMinute: 10,
  windowMs: 15 * 60 * 1000,
});

function validateEmail(email: unknown): email is string {
  return typeof email === "string" && EMAIL_REGEX.test(email.trim());
}

async function getPosition(supabase: ReturnType<typeof createAdminClient>, createdAt: string): Promise<number> {
  const { count, error } = await supabase
    .from("waitlist")
    .select("id", { count: "exact", head: true })
    .lte("created_at", createdAt);
  if (error) {
    console.error("WAITLIST_ERROR", { message: "getPosition failed", code: error.code, details: error.message, hint: error.hint });
    return 0;
  }
  return count ?? 0;
}

type EmailSendResult = {
  sent: boolean;
  error?: string;
};

async function persistEmailAttempt(
  supabase: ReturnType<typeof createAdminClient>,
  id: string,
  result: EmailSendResult
): Promise<void> {
  const payload: Record<string, unknown> = {
    confirmation_email_status: result.sent ? "sent" : "failed",
    confirmation_email_error: result.sent ? null : result.error ?? "unknown_error",
    confirmation_email_last_attempt_at: new Date().toISOString(),
  };
  if (result.sent) {
    payload.confirmation_email_sent_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from("waitlist")
    .update(payload as never)
    .eq("id", id);
  if (error) {
    console.error("WAITLIST_ERROR", {
      message: "Persist email attempt failed",
      code: error.code,
      details: error.message,
      hint: error.hint,
    });
  }
}

async function sendConfirmationEmail(email: string, position: number, name?: string | null): Promise<EmailSendResult> {
  const env = getServerEnv();
  const subject = buildWaitlistSubject({ variant: "author", email, position, name });
  const html = buildWaitlistHtml({ variant: "author", email, position, name });

  try {
    const resend = new Resend(env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: env.RESEND_FROM_EMAIL,
      to: email,
      subject,
      html,
    });
    if (error) {
      console.error("WAITLIST_ERROR", { message: "Resend send failed", code: error.message, details: JSON.stringify(error), hint: "check RESEND_API_KEY and domain" });
      return { sent: false, error: error.message };
    }
    return { sent: true };
  } catch (err) {
    console.error("WAITLIST_ERROR", { message: "Resend exception", code: String(err), details: err instanceof Error ? err.message : "", hint: "check RESEND_API_KEY" });
    return { sent: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function POST(request: Request) {
  // Validate required env vars early
  try {
    assertServerEnv();
  } catch (error) {
    console.error("ENV_VALIDATION_ERROR", error);
    return apiError(E_SERVER_CONFIG_ERROR, 500);
  }

  try {
    const ip = getClientIpFromRequest(request);
    const { allowed } = await waitlistLimiter.check(`waitlist:${ip}`);
    if (!allowed) {
      return apiError(E_RATE_LIMIT_EXCEEDED, 429);
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return apiError(E_INVALID_REQUEST_BODY, 400);
    }

    const rawEmail = body.email;
    const name = typeof body.name === "string" ? body.name.trim() || null : null;
    if (!validateEmail(rawEmail)) {
      return apiError(E_INVALID_EMAIL, 400);
    }

    const email = rawEmail.trim().toLowerCase();
    const role = body.role != null ? String(body.role) : null;
    const source = body.source != null ? String(body.source) : null;

    let supabase;
    try {
      supabase = createAdminClient();
    } catch (e) {
      console.error("WAITLIST_ERROR", { message: "createAdminClient failed", code: String(e), details: e instanceof Error ? e.message : "", hint: "Check SUPABASE_SERVICE_ROLE_KEY" });
      return apiError(E_SERVER_CONFIG_ERROR, 500);
    }

    const { data: inserted, error: insertError } = await supabase
      .from("waitlist")
      .insert({ email, role, source })
      .select("id, created_at")
      .single();

    if (insertError) {
      const code = insertError.code ?? "";
      const isUniqueViolation = code === "23505" || String(insertError.message).includes("unique") || String(insertError.message).includes("duplicate");
      if (isUniqueViolation) {
        const { data: existing, error: selectError } = await supabase
          .from("waitlist")
          .select("id, created_at, confirmation_email_sent_at")
          .ilike("email", email)
          .maybeSingle();
        if (selectError) {
          console.error("WAITLIST_ERROR", { message: "Select existing failed", code: selectError.code, details: selectError.message, hint: selectError.hint });
          return apiError(E_SIGNUP_VERIFICATION_FAILED, 500);
        }
        if (!existing) {
          return apiError(E_GENERIC_ERROR, 500);
        }
        const position = await getPosition(supabase, existing.created_at);
        console.info("[waitlist] duplicate signup", { id: existing.id });
        const existingRecord = existing as { id: string; created_at: string; confirmation_email_sent_at?: string | null };
        let emailSent = false;
        if (!existingRecord.confirmation_email_sent_at) {
          const sendResult = await sendConfirmationEmail(email, position, name);
          emailSent = sendResult.sent;
          await persistEmailAttempt(supabase, existingRecord.id, sendResult);
        }
        return NextResponse.json(
          { ok: true, position, id: existing.id, alreadyExists: true, emailSent },
          { status: 200 }
        );
      }
      console.error("WAITLIST_ERROR", { message: insertError.message, code: insertError.code, details: insertError.details, hint: insertError.hint });
      return apiError(E_WAITLIST_ADD_FAILED, 500);
    }

    if (!inserted) {
      console.error("WAITLIST_ERROR", { message: "No row returned after insert", code: "EMPTY", details: "", hint: "" });
      return apiError(E_GENERIC_ERROR, 500);
    }

    const position = await getPosition(supabase, inserted.created_at);
    console.info("[waitlist] signup stored", { source: source ?? "unknown", position, isNew: true });

    // Cohort funnel metric: waitlist_signup. Errors are logged inside
    // logAnalyticsEvent — never silent. Awaited so test harness can assert.
    await logAnalyticsEvent(supabase, {
      eventType: "waitlist_signup",
      userId: null,
      path: "/waitlist",
      props: { variant: "author", source: source ?? null, role: role ?? null, position },
    });

    const sendResult = await sendConfirmationEmail(email, position, name);
    await persistEmailAttempt(supabase, inserted.id, sendResult);

    return NextResponse.json({
      ok: true,
      position,
      id: inserted.id,
      alreadyExists: false,
      emailSent: sendResult.sent,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("WAITLIST_ERROR", { message, code: "EXCEPTION", details: err instanceof Error ? err.stack : "", hint: "" });
    return apiError(E_GENERIC_ERROR, 500);
  }
}
