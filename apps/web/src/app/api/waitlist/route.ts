import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertServerEnv, getServerEnv } from "@/lib/env";
import { wrapApiRoute, jsonError, ERROR_CODES } from "@/lib/api/errors";
import { waitlistBodySchema, firstZodMessage } from "@/lib/api/schemas";
import { checkRateLimit, rateLimitKey } from "@/lib/api/rate-limit";

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

async function postHandler(request: Request, ctx: { requestId: string }): Promise<Response> {
  try {
    assertServerEnv();
  } catch (error) {
    console.error("ENV_VALIDATION_ERROR", error);
    return jsonError(ERROR_CODES.CONFIG_ERROR, "Server configuration error", ctx.requestId, 500);
  }

  const key = rateLimitKey(request, "/api/waitlist");
  if (!checkRateLimit(key, { windowMs: 15 * 60 * 1000, max: 10 }).allowed) {
    return jsonError(ERROR_CODES.RATE_LIMIT, "Too many signups. Try again in a few minutes.", ctx.requestId, 429);
  }

  const raw = await request.json().catch(() => null);
  const parsed = waitlistBodySchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return jsonError(ERROR_CODES.VALIDATION_ERROR, firstZodMessage(parsed), ctx.requestId, 400);
  }
  const { email: rawEmail, role, source } = parsed.data;
  const email = rawEmail.trim().toLowerCase();

  let supabase;
  try {
    supabase = createAdminClient();
  } catch (e) {
    console.error("WAITLIST_ERROR", { message: "createAdminClient failed", code: String(e), details: e instanceof Error ? e.message : "", hint: "Check SUPABASE_SERVICE_ROLE_KEY" });
    return jsonError(ERROR_CODES.CONFIG_ERROR, "Server configuration error", ctx.requestId, 500);
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
        return jsonError(ERROR_CODES.INTERNAL_ERROR, "Could not verify your signup", ctx.requestId, 500);
      }
      if (!existing) {
        return jsonError(ERROR_CODES.INTERNAL_ERROR, "Something went wrong", ctx.requestId, 500);
      }
      const position = await getPosition(supabase, existing.created_at);
      console.log("WAITLIST_DUPLICATE", { email, id: existing.id });
      return NextResponse.json(
        { ok: true, position, id: existing.id, alreadyExists: true },
        { status: 200, headers: { "x-request-id": ctx.requestId } }
      );
    }
    console.error("WAITLIST_ERROR", { message: insertError.message, code: insertError.code, details: insertError.details, hint: insertError.hint });
    return jsonError(ERROR_CODES.INTERNAL_ERROR, "Could not add you to the list", ctx.requestId, 500);
  }

  if (!inserted) {
    console.error("WAITLIST_ERROR", { message: "No row returned after insert", code: "EMPTY", details: "", hint: "" });
    return jsonError(ERROR_CODES.INTERNAL_ERROR, "Something went wrong", ctx.requestId, 500);
  }

  const position = await getPosition(supabase, inserted.created_at);
  console.log("WAITLIST_SIGNUP", { source: source ?? "unknown", position, isNew: true });
  sendConfirmationEmail(email, position).catch((err) => {
    console.error("WAITLIST_ERROR", { message: "Confirmation email failed", code: "RESEND", details: String(err), hint: "API still returns ok true" });
  });

  return NextResponse.json(
    { ok: true, position, id: inserted.id, alreadyExists: false },
    { headers: { "x-request-id": ctx.requestId } }
  );
}

export const POST = wrapApiRoute(postHandler);
