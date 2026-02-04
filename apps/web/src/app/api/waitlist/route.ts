import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
<<<<<<< HEAD
import { Resend } from "resend";
import { assertServerEnv, getServerEnv } from "@/lib/env";
=======
import { sendWaitlistEmail } from "@/lib/resend/sendWaitlistEmail";
>>>>>>> main

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Simple in-memory rate limit: max 10 signups per IP per 15 min. Resets on cold start. */
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
    .from("waitlist")
    .select("id", { count: "exact", head: true })
    .lte("created_at", createdAt);
  if (error) {
    console.error("WAITLIST_ERROR", { message: "getPosition failed", code: error.code, details: error.message, hint: error.hint });
    return 0;
  }
  return count ?? 0;
}

<<<<<<< HEAD
async function sendConfirmationEmail(email: string, position: number): Promise<void> {
  const env = getServerEnv();
  
  try {
    const resend = new Resend(env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: env.RESEND_FROM_EMAIL,
      to: email,
      subject: "You are on the Verkli waitlist",
      html: `
        <p>Hi there,</p>
        <p>You're on the list. Your position: <strong>#${position}</strong>.</p>
        <p>We'll be in touch when it's your turn.</p>
        <p>— Verkli</p>
      `,
    });
    if (error) {
      console.error("WAITLIST_ERROR", { message: "Resend send failed", code: error.message, details: JSON.stringify(error), hint: "check RESEND_API_KEY and domain" });
    }
  } catch (err) {
    console.error("WAITLIST_ERROR", { message: "Resend exception", code: String(err), details: err instanceof Error ? err.message : "", hint: "check RESEND_API_KEY" });
  }
}

export async function POST(request: Request) {
  // Validate required env vars early
  try {
    assertServerEnv();
  } catch (error) {
    console.error("ENV_VALIDATION_ERROR", error);
    return NextResponse.json(
      { ok: false, error: "Server configuration error. Please contact support.", details: "Missing environment variables" },
      { status: 500 }
    );
  }
=======
export async function POST(request: Request) {
  // Temporary: verify service role is loaded (if false, API runs with anon key and RLS blocks)
  console.log("SERVICE ROLE SET", !!process.env.SUPABASE_SERVICE_ROLE_KEY);
  console.log("SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL ? "set" : "missing");
>>>>>>> main

  try {
    const ip = getClientIp(request);
    const { allowed } = checkRateLimit(ip);
    if (!allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many signups. Try again in a few minutes.", details: "rate_limit" },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, error: "Invalid request body", details: "Expected JSON object" }, { status: 400 });
    }

    const rawEmail = body.email;
    if (!validateEmail(rawEmail)) {
      return NextResponse.json({ ok: false, error: "Please enter a valid email address.", details: "Invalid email format" }, { status: 400 });
    }

    const email = rawEmail.trim().toLowerCase();
    const role = body.role != null ? String(body.role) : null;
    const source = body.source != null ? String(body.source) : null;

<<<<<<< HEAD
=======
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      console.error("WAITLIST_ERROR", { message: "Missing Supabase env", code: "ENV", details: "NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY", hint: "Set in .env.local" });
      return NextResponse.json(
        { ok: false, error: "Server configuration error. Please try again later.", details: "Missing Supabase configuration" },
        { status: 500 }
      );
    }

>>>>>>> main
    let supabase;
    try {
      supabase = createAdminClient();
    } catch (e) {
      console.error("WAITLIST_ERROR", { message: "createAdminClient failed", code: String(e), details: e instanceof Error ? e.message : "", hint: "Check SUPABASE_SERVICE_ROLE_KEY" });
      return NextResponse.json(
        { ok: false, error: "Server configuration error. Please try again later.", details: "Supabase client init failed" },
        { status: 500 }
      );
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
          .select("id, created_at")
          .ilike("email", email)
          .maybeSingle();
        if (selectError) {
          console.error("WAITLIST_ERROR", { message: "Select existing failed", code: selectError.code, details: selectError.message, hint: selectError.hint });
          return NextResponse.json(
            { ok: false, error: "Could not verify your signup. Please try again.", details: selectError.message },
            { status: 500 }
          );
        }
        if (!existing) {
          return NextResponse.json(
            { ok: false, error: "Something went wrong. Please try again.", details: insertError.message },
            { status: 500 }
          );
        }
        const position = await getPosition(supabase, existing.created_at);
        console.log("WAITLIST_DUPLICATE", { email, id: existing.id });
        return NextResponse.json(
          { ok: true, position, id: existing.id, alreadyExists: true },
          { status: 200 }
        );
      }
      console.error("WAITLIST_ERROR", { message: insertError.message, code: insertError.code, details: insertError.details, hint: insertError.hint });
      return NextResponse.json(
        { ok: false, error: "Could not add you to the list. Please try again.", details: insertError.message },
        { status: 500 }
      );
    }

    if (!inserted) {
      console.error("WAITLIST_ERROR", { message: "No row returned after insert", code: "EMPTY", details: "", hint: "" });
      return NextResponse.json(
        { ok: false, error: "Something went wrong. Please try again.", details: "Insert returned no row" },
        { status: 500 }
      );
    }

    const position = await getPosition(supabase, inserted.created_at);
    console.log("WAITLIST_SIGNUP", { source: source ?? "unknown", position, isNew: true });
<<<<<<< HEAD
    sendConfirmationEmail(email, position).catch((err) => {
=======
    sendWaitlistEmail(email, "author").catch((err) => {
>>>>>>> main
      console.error("WAITLIST_ERROR", { message: "Confirmation email failed", code: "RESEND", details: String(err), hint: "API still returns ok true" });
    });

    return NextResponse.json({ ok: true, position, id: inserted.id, alreadyExists: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("WAITLIST_ERROR", { message, code: "EXCEPTION", details: err instanceof Error ? err.stack : "", hint: "" });
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again.", details: message },
      { status: 500 }
    );
  }
}
