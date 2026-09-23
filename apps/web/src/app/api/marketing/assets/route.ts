import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAuthorAndMarketingEnabled } from "@/lib/auth/require-author-marketing";
import { normalizeLanguage } from "@/lib/languages";
import { assertBookOwned } from "@/lib/marketing/assert-book-owner";
import {
  createAssetBodySchema,
  listAssetsQuerySchema,
} from "@/lib/marketing/schemas";
import {
  apiError,
  E_DATABASE_ERROR,
  E_INVALID_JSON,
  E_VALIDATION_FAILED,
} from "@/lib/api-errors";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const gate = await requireAuthorAndMarketingEnabled();
  if (gate.response) return gate.response;

  const { searchParams } = new URL(request.url);
  const query = listAssetsQuerySchema.safeParse({ bookId: searchParams.get("bookId") ?? "" });
  if (!query.success) {
    return apiError(E_VALIDATION_FAILED, 400);
  }

  const supabase = await createClient();
  const ownership = await assertBookOwned(supabase, gate.user.id, query.data.bookId);
  if (!ownership.ok) return ownership.response;

  const { data: rows, error } = await supabase
    .from("marketing_assets")
    .select("id, book_id, channel, language, content_type, text, metadata, created_at")
    .eq("book_id", query.data.bookId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[marketing assets list]", error.message);
    return apiError(E_DATABASE_ERROR, 500);
  }

  return NextResponse.json({ assets: rows ?? [] });
}

export async function POST(request: Request) {
  const gate = await requireAuthorAndMarketingEnabled();
  if (gate.response) return gate.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(E_INVALID_JSON, 400);
  }

  const parsed = createAssetBodySchema.safeParse(body);
  if (!parsed.success) {
    return apiError(E_VALIDATION_FAILED, 400);
  }

  const { bookId, channel, language: rawLang, contentType, text, metadata } = parsed.data;
  const language = normalizeLanguage(rawLang);

  const supabase = await createClient();
  const ownership = await assertBookOwned(supabase, gate.user.id, bookId);
  if (!ownership.ok) return ownership.response;

  const { data: inserted, error } = await supabase
    .from("marketing_assets")
    .insert({
      book_id: bookId,
      channel,
      language,
      content_type: contentType,
      text,
      metadata: metadata ?? {},
    })
    .select("id, book_id, channel, language, content_type, text, metadata, created_at")
    .single();

  if (error) {
    console.error("[marketing assets save]", error.message);
    return apiError(E_DATABASE_ERROR, 500);
  }

  return NextResponse.json(inserted);
}
