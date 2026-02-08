import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Resend } from "resend";
import { assertServerEnv, getServerEnv } from "@/lib/env";
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

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX = 10;
const rateLimitMap = new Map<string, { count: number; firstAt: number }>();

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}

function checkRateLimit(ip: string): { allowed: boolean } {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry) {
    rateLimitMap.set(ip, { count: 1, firstAt: now });
    return { allowed: true };
  }
  if (now - entry.firstAt > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, firstAt: now });
    return { allowed: true };
  }
  entry.count += 1;
  if (entry.count > RATE_LIMIT_MAX) return { allowed: false };
  return { allowed: true };
}

function validateEmail(email: unknown): email is string {
  return typeof email === "string" && EMAIL_REGEX.test(email.trim());
}

async function getPosition(supabase: ReturnType<typeof createAdminClient>, createdAt: string): Promise<number> {
  const { count, error } = await supabase
    .from("reader_waitlist")
    .select("id", { count: "exact", head: true })
    .lte("created_at", createdAt);
  if (error) {
    console.error("READER_WAITLIST_ERROR", { message: "getPosition failed", code: error.code, details: error.message, hint: error.hint });
    return 0;
  }
  return count ?? 0;
}

async function sendReaderConfirmationEmail(email: string, position: number): Promise<void> {
  const env = getServerEnv();
  
  try {
    const resend = new Resend(env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: env.RESEND_FROM_EMAIL,
      to: email,
      subject: "You're on the Verkli reader waitlist",
      html: `
        <p>Hi there,</p>
        <p>You're on the reader waitlist. Your position: <strong>#${position}</strong>.</p>
        <p>We'll be in touch when it's your turn.</p>
        <p>— Verkli</p>
      `,
    });
    if (error) {
      console.error("READER_WAITLIST_ERROR", { message: "Resend send failed", code: error.message, details: JSON.stringify(error), hint: "check RESEND_API_KEY and domain" });
    }
  } catch (err) {
    console.error("READER_WAITLIST_ERROR", { message: "Resend exception", code: String(err), details: err instanceof Error ? err.message : "", hint: "check RESEND_API_KEY" });
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
    const ip = getClientIp(request);
    const { allowed } = checkRateLimit(ip);
    if (!allowed) {
      return apiError(E_RATE_LIMIT_EXCEEDED, 429);
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return apiError(E_INVALID_REQUEST_BODY, 400);
    }

    const rawEmail = body.email;
    if (!validateEmail(rawEmail)) {
      return apiError(E_INVALID_EMAIL, 400);
    }

    const email = rawEmail.trim().toLowerCase();
    const source = body.source != null ? String(body.source) : null;
    const followAuthor = body.follow_author != null ? String(body.follow_author) : null;

    let supabase;
    try {
      supabase = createAdminClient();
    } catch (e) {
      console.error("READER_WAITLIST_ERROR", { message: "createAdminClient failed", code: String(e), details: e instanceof Error ? e.message : "", hint: "Check SUPABASE_SERVICE_ROLE_KEY" });
      return apiError(E_SERVER_CONFIG_ERROR, 500);
    }

    const { data: inserted, error: insertError } = await supabase
      .from("reader_waitlist")
      .insert({ email, source, follow_author: followAuthor })
      .select("id, created_at")
      .single();

    if (insertError) {
      const code = insertError.code ?? "";
      const isUniqueViolation = code === "23505" || String(insertError.message).includes("unique") || String(insertError.message).includes("duplicate");
      if (isUniqueViolation) {
        const { data: existing, error: selectError } = await supabase
          .from("reader_waitlist")
          .select("id, created_at")
          .ilike("email", email)
          .maybeSingle();
        if (selectError) {
          console.error("READER_WAITLIST_ERROR", { message: "Select existing failed", code: selectError.code, details: selectError.message, hint: selectError.hint });
          return apiError(E_SIGNUP_VERIFICATION_FAILED, 500);
        }
        if (!existing) {
          return apiError(E_GENERIC_ERROR, 500);
        }
        const position = await getPosition(supabase, existing.created_at);
        console.log("READER_WAITLIST_DUPLICATE", { email, id: existing.id });
        return NextResponse.json(
          { ok: true, position, id: existing.id, alreadyExists: true },
          { status: 200 }
        );
      }
      console.error("READER_WAITLIST_ERROR", { message: insertError.message, code: insertError.code, details: insertError.details, hint: insertError.hint });
      return apiError(E_WAITLIST_ADD_FAILED, 500);
    }

    if (!inserted) {
      console.error("READER_WAITLIST_ERROR", { message: "No row returned after insert", code: "EMPTY", details: "", hint: "" });
      return apiError(E_GENERIC_ERROR, 500);
    }

    const position = await getPosition(supabase, inserted.created_at);
    console.log("READER_WAITLIST_SIGNUP", { source: source ?? "unknown", position, isNew: true });
    sendReaderConfirmationEmail(email, position).catch((err) => {
      console.error("READER_WAITLIST_ERROR", { message: "Confirmation email failed", code: "RESEND", details: String(err), hint: "API still returns ok true" });
    });

    return NextResponse.json({ ok: true, position, id: inserted.id, alreadyExists: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("READER_WAITLIST_ERROR", { message, code: "EXCEPTION", details: err instanceof Error ? err.stack : "", hint: "" });
    return apiError(E_GENERIC_ERROR, 500);
  }
}
