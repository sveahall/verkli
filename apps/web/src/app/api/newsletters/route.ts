import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isNewslettersEnabled } from "@/lib/flags";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import {
  apiError,
  E_NOT_AUTHENTICATED,
  E_NEWSLETTERS_FEATURE_DISABLED,
  E_NEWSLETTER_CREATE_FAILED,
  E_INVALID_JSON,
  E_VALIDATION_FAILED,
} from "@/lib/api-errors";

const createNewsletterBodySchema = z.object({
  subject: z.string().min(1).max(500),
  bodyHtml: z.string().default(""),
  bodyText: z.string().default(""),
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

export async function GET() {
  if (!isNewslettersEnabled()) {
    return apiError(E_NEWSLETTERS_FEATURE_DISABLED, 403);
  }

  const { user, response } = await requireAuthorRoleForApi();
  if (response) return response;

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("newsletters" as never)
    .select(NEWSLETTER_SELECT)
    .eq("author_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[newsletters] list failed", {
      userId: user.id,
      message: error.message,
      code: error.code,
    });
    return apiError(E_NEWSLETTER_CREATE_FAILED, 500);
  }

  const newsletters = (data ?? []) as NewsletterRow[];

  return NextResponse.json({ newsletters });
}

export async function POST(request: Request) {
  if (!isNewslettersEnabled()) {
    return apiError(E_NEWSLETTERS_FEATURE_DISABLED, 403);
  }

  const { user, response } = await requireAuthorRoleForApi();
  if (response) return response;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(E_INVALID_JSON, 400);
  }

  const parsed = createNewsletterBodySchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(E_VALIDATION_FAILED, 400);
  }

  const { subject, bodyHtml, bodyText } = parsed.data;

  const supabase = await createClient();

  const { data: newsletter, error: insertError } = await supabase
    .from("newsletters" as never)
    .insert({
      author_id: user.id,
      subject,
      body_html: bodyHtml,
      body_text: bodyText,
    } as never)
    .select(NEWSLETTER_SELECT)
    .single();

  if (insertError || !newsletter) {
    console.error("[newsletters] create failed", {
      userId: user.id,
      message: insertError?.message,
      code: insertError?.code,
    });
    return apiError(E_NEWSLETTER_CREATE_FAILED, 500);
  }

  return NextResponse.json({ newsletter: newsletter as NewsletterRow }, { status: 201 });
}
