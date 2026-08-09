import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  apiError,
  E_SERVER_CONFIG_ERROR,
  E_RATE_LIMIT_EXCEEDED,
  E_INVALID_REQUEST_BODY,
  E_INVALID_EMAIL,
  E_VALIDATION_FAILED,
  E_GENERIC_ERROR,
} from "@/lib/api-errors";
import { createPerUserRateLimiter } from "@/lib/rate-limit";
import { getClientIpFromRequest } from "@/lib/request-ip";
import { validateAnswers } from "@/lib/apply/questions";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const NAME_MAX = 120;
const ROUND = "round_one";

// Same budget as the waitlist route. Applicants can share an IP (an office, a
// university, a phone network), so a tighter limit would lock out real authors
// long before it inconvenienced anyone abusing the form.
const applyLimiter = createPerUserRateLimiter({
  maxPerMinute: 10,
  windowMs: 15 * 60 * 1000,
});

function readName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > NAME_MAX) return null;
  return trimmed;
}

export async function POST(request: Request) {
  try {
    const ip = getClientIpFromRequest(request);
    const { allowed } = await applyLimiter.check(`apply:${ip}`);
    if (!allowed) {
      return apiError(E_RATE_LIMIT_EXCEEDED, 429);
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return apiError(E_INVALID_REQUEST_BODY, 400);
    }

    const rawEmail = (body as Record<string, unknown>).email;
    if (typeof rawEmail !== "string" || !EMAIL_REGEX.test(rawEmail.trim())) {
      return apiError(E_INVALID_EMAIL, 400);
    }
    const email = rawEmail.trim().toLowerCase();

    const firstName = readName((body as Record<string, unknown>).firstName);
    const lastName = readName((body as Record<string, unknown>).lastName);
    if (!firstName) {
      return apiError(E_VALIDATION_FAILED, 400, { field: "firstName" });
    }

    const validated = validateAnswers((body as Record<string, unknown>).answers);
    if (!validated.ok) {
      return apiError(E_VALIDATION_FAILED, 400, { field: validated.fieldId });
    }

    let supabase;
    try {
      supabase = createAdminClient();
    } catch (e) {
      console.error("APPLY_ERROR", {
        message: "createAdminClient failed",
        details: e instanceof Error ? e.message : String(e),
        hint: "Check SUPABASE_SERVICE_ROLE_KEY",
      });
      return apiError(E_SERVER_CONFIG_ERROR, 500);
    }

    // Link the application to the waitlist row when the address matches, so a
    // reviewer can tell an invited applicant from someone who found the form.
    const { data: waitlistRow } = await supabase
      .from("waitlist")
      .select("id")
      .ilike("email", email)
      .maybeSingle();

    const record = {
      email,
      first_name: firstName,
      last_name: lastName,
      answers: validated.answers,
      round: ROUND,
      source: "apply_page",
      waitlist_id: waitlistRow?.id ?? null,
      on_waitlist: Boolean(waitlistRow?.id),
    };
    // `updated_at` is left to the column default on insert so it comes from the
    // database clock, matching created_at. Only the update path stamps it.

    const { error: insertError } = await supabase
      .from("beta_applications")
      .insert(record);

    if (insertError) {
      const isDuplicate =
        insertError.code === "23505" ||
        /duplicate|unique/i.test(insertError.message ?? "");

      if (!isDuplicate) {
        console.error("APPLY_ERROR", {
          message: "insert failed",
          code: insertError.code,
          details: insertError.message,
        });
        return apiError(E_GENERIC_ERROR, 500);
      }

      // Re-submission: replace the previous answers and put the row back in the
      // review queue. Reviewer notes are intentionally left untouched.
      const { error: updateError } = await supabase
        .from("beta_applications")
        .update({ ...record, status: "pending", updated_at: new Date().toISOString() })
        .eq("round", ROUND)
        .ilike("email", email);

      if (updateError) {
        console.error("APPLY_ERROR", {
          message: "update failed",
          code: updateError.code,
          details: updateError.message,
        });
        return apiError(E_GENERIC_ERROR, 500);
      }

      return NextResponse.json({ ok: true, updated: true });
    }

    return NextResponse.json({ ok: true, updated: false });
  } catch (err) {
    console.error("APPLY_ERROR", {
      message: err instanceof Error ? err.message : String(err),
      code: "EXCEPTION",
      details: err instanceof Error ? err.stack : "",
    });
    return apiError(E_GENERIC_ERROR, 500);
  }
}
