import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isNewslettersEnabled } from "@/lib/flags";
import {
  apiError,
  E_NOT_AUTHENTICATED,
  E_NEWSLETTERS_FEATURE_DISABLED,
  E_NEWSLETTER_NOT_FOUND,
  E_NEWSLETTER_UPDATE_FAILED,
  E_NEWSLETTER_ALREADY_SENT,
  E_FORBIDDEN,
  E_INVALID_JSON,
  E_VALIDATION_FAILED,
} from "@/lib/api-errors";

const paramsSchema = z.object({
  id: z.string().uuid("Invalid newsletter ID"),
});

const updateNewsletterBodySchema = z.object({
  subject: z.string().min(1).max(500).optional(),
  bodyHtml: z.string().optional(),
  bodyText: z.string().optional(),
});

type NewsletterRow = {
  id: string;
  author_id: string;
  subject: string;
  body_html: string;
  body_text: string;
  status: string;
  sent_at: string | null;
  recipient_count: number;
  created_at: string;
};

const NEWSLETTER_SELECT =
  "id, author_id, subject, body_html, body_text, status, sent_at, recipient_count, created_at";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isNewslettersEnabled()) {
    return apiError(E_NEWSLETTERS_FEATURE_DISABLED, 403);
  }

  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return apiError(E_VALIDATION_FAILED, 400);
  }

  const { id } = parsedParams.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError(E_NOT_AUTHENTICATED, 401);
  }

  const { data: newsletter, error } = await supabase
    .from("newsletters" as never)
    .select(NEWSLETTER_SELECT)
    .eq("id", id)
    .eq("author_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[newsletters] detail failed", {
      newsletterId: id,
      userId: user.id,
      message: error.message,
      code: error.code,
    });
    return apiError(E_NEWSLETTER_NOT_FOUND, 404);
  }

  if (!newsletter) {
    return apiError(E_NEWSLETTER_NOT_FOUND, 404);
  }

  return NextResponse.json({ newsletter: newsletter as NewsletterRow });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isNewslettersEnabled()) {
    return apiError(E_NEWSLETTERS_FEATURE_DISABLED, 403);
  }

  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return apiError(E_VALIDATION_FAILED, 400);
  }

  const { id } = parsedParams.data;

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

  const parsed = updateNewsletterBodySchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(E_VALIDATION_FAILED, 400);
  }

  // Verify newsletter exists and belongs to user
  const { data: existing, error: lookupError } = await supabase
    .from("newsletters" as never)
    .select(NEWSLETTER_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (lookupError || !existing) {
    return apiError(E_NEWSLETTER_NOT_FOUND, 404);
  }

  const existingNl = existing as NewsletterRow;

  if (existingNl.author_id !== user.id) {
    return apiError(E_FORBIDDEN, 403);
  }

  if (existingNl.status !== "draft") {
    return apiError(E_NEWSLETTER_ALREADY_SENT, 400);
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.subject !== undefined) updates.subject = parsed.data.subject;
  if (parsed.data.bodyHtml !== undefined) updates.body_html = parsed.data.bodyHtml;
  if (parsed.data.bodyText !== undefined) updates.body_text = parsed.data.bodyText;

  const { data: updated, error: updateError } = await supabase
    .from("newsletters" as never)
    .update(updates as never)
    .eq("id", id)
    .select(NEWSLETTER_SELECT)
    .single();

  if (updateError || !updated) {
    console.error("[newsletters] update failed", {
      newsletterId: id,
      userId: user.id,
      message: updateError?.message,
      code: updateError?.code,
    });
    return apiError(E_NEWSLETTER_UPDATE_FAILED, 500);
  }

  return NextResponse.json({ newsletter: updated as NewsletterRow });
}
