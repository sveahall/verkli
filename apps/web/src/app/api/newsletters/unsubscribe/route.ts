import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyUnsubscribeToken } from "@/lib/newsletters/unsubscribe-token";
import { privateUnsubscribeResponse, unsubscribePage } from "@/lib/newsletters/unsubscribe-page";
import {
  apiError,
  E_NOT_AUTHENTICATED,
  E_NEWSLETTER_SUBSCRIBE_FAILED,
  E_INVALID_JSON,
  E_VALIDATION_FAILED,
} from "@/lib/api-errors";

const unsubscribeBodySchema = z.object({
  authorId: z.string().uuid("Invalid author ID"),
});

const MAX_TOKEN_LENGTH = 2048;
const MAX_FORM_BYTES = 8192;
const isFormContentType = (request: Request) => ["application/x-www-form-urlencoded", "multipart/form-data"].includes(request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "");
const validToken = (token: string) => token.length <= MAX_TOKEN_LENGTH ? verifyUnsubscribeToken(token) : null;
const tokenError = (html: boolean) => html ? unsubscribePage("invalid") : privateUnsubscribeResponse(apiError(E_VALIDATION_FAILED, 400));

// Bound streamed bodies before parsing multipart/form data.
async function readUnsubscribeForm(request: Request): Promise<FormData | null> {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_FORM_BYTES) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    const body = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    return await new Response(body, { headers: { "Content-Type": request.headers.get("content-type")! } }).formData();
  } catch { return null; }
  finally { reader.releaseLock(); }
}

// The signed token alone identifies the recipient. Never read session cookies
// or fall back to the authenticated JSON path for either anonymous form mode.
async function handleTokenUnsubscribe(token: string, html: boolean): Promise<Response> {
  const verified = validToken(token);
  if (!verified) return tokenError(html);
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("newsletter_subscriptions")
      .update({ status: "unsubscribed", unsubscribed_at: new Date().toISOString() } as never)
      .eq("author_id", verified.authorId).eq("subscriber_user_id", verified.subscriberUserId);
    if (error) {
      console.error("[newsletters unsubscribe] storage failure", { code: error.code });
      return html ? unsubscribePage("failed", { token }) : privateUnsubscribeResponse(apiError(E_NEWSLETTER_SUBSCRIBE_FAILED, 500));
    }
    return html ? unsubscribePage("success") : privateUnsubscribeResponse(NextResponse.json({ ok: true }));
  } catch {
    console.error("[newsletters unsubscribe] storage operation failed");
    return html ? unsubscribePage("failed", { token }) : privateUnsubscribeResponse(apiError(E_NEWSLETTER_SUBSCRIBE_FAILED, 500));
  }
}

// Existing email links remain valid, but GET (including mail scanners and
// browser prefetch) only renders confirmation. No DB or auth client is used.
export async function GET(request: Request) {
  const values = new URL(request.url).searchParams.getAll("token");
  const token = values.length === 1 ? values[0].trim() : "";
  return validToken(token) ? unsubscribePage("confirm", { token }) : unsubscribePage("invalid");
}

export async function POST(request: Request) {
  const params = new URL(request.url).searchParams;
  const hasQueryToken = params.has("token");
  if (hasQueryToken || isFormContentType(request)) {
    const html = !hasQueryToken;
    if (!isFormContentType(request)) return tokenError(html);
    const form = await readUnsubscribeForm(request);
    if (!form) return tokenError(html);
    if (hasQueryToken) {
      // RFC8058: same URL as the old footer, exact one-click form marker.
      const tokens = params.getAll("token");
      if (tokens.length !== 1 || [...form.keys()].length !== 1 || form.get("List-Unsubscribe") !== "One-Click") return tokenError(false);
      return handleTokenUnsubscribe(tokens[0].trim(), false);
    }
    const tokens = form.getAll("token");
    if ([...form.keys()].length !== 2 || tokens.length !== 1 || typeof tokens[0] !== "string" || form.get("confirm") !== "unsubscribe") return tokenError(true);
    return handleTokenUnsubscribe(tokens[0].trim(), true);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError(E_NOT_AUTHENTICATED, 401);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(E_INVALID_JSON, 400);
  }

  const parsed = unsubscribeBodySchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(E_VALIDATION_FAILED, 400);
  }

  const { authorId } = parsed.data;

  const { error: updateError } = await supabase
    .from("newsletter_subscriptions")
    .update({
      status: "unsubscribed",
      unsubscribed_at: new Date().toISOString(),
    } as never)
    .eq("author_id", authorId)
    .eq("subscriber_user_id", user.id);

  if (updateError) {
    console.error("[newsletters] unsubscribe failed", {
      userId: user.id,
      authorId,
      message: updateError.message,
      code: updateError.code,
    });
    return apiError(E_NEWSLETTER_SUBSCRIBE_FAILED, 500);
  }

  return NextResponse.json({ ok: true });
}
