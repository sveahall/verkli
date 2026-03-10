import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateCoverImages } from "@/lib/higgsfield";
import {
  apiError,
  E_BOOK_NOT_FOUND,
  E_COVER_GENERATION_FAILED,
  E_DATABASE_ERROR,
  E_INVALID_JSON,
  E_PROMPT_TEXT_REQUIRED,
  E_UNAUTHORIZED,
  E_VALIDATION_FAILED,
} from "@/lib/api-errors";

export const runtime = "nodejs";
export const maxDuration = 180;

const coverGenerateSchema = z.object({
  prompt: z.string().max(2000),
  style: z.enum(["minimal", "photographic", "illustrated", "vintage"]).default("minimal"),
});

const COVER_STYLE_PROMPTS: Record<
  z.infer<typeof coverGenerateSchema>["style"],
  string
> = {
  minimal:
    "professional minimalist book cover, Scandinavian design style, restrained palette, elegant composition",
  photographic:
    "professional photographic book cover, cinematic lighting, premium publishing detail, high-end editorial mood",
  illustrated:
    "professional illustrated book cover, expressive shapes, rich storytelling atmosphere, painterly detail",
  vintage:
    "professional vintage-inspired book cover, classic print texture, retro palette, timeless publishing aesthetic",
};

const COVER_LAYOUT_INSTRUCTIONS =
  "bold modern typography, strong contrast, clear visual hierarchy, centered title layout, balanced margins, vertical book cover, premium bookstore-ready composition";

function getPrimaryGenreLabel(
  genres: Array<{ name_en?: string | null; name_sv?: string | null; slug?: string | null }>
): string {
  const primary = genres[0];
  const label = primary?.name_en?.trim() || primary?.name_sv?.trim() || primary?.slug?.trim();
  return label || "general";
}

function buildCoverPrompt({
  title,
  genre,
  userPrompt,
  style,
}: {
  title: string;
  genre: string;
  userPrompt: string;
  style: z.infer<typeof coverGenerateSchema>["style"];
}): string {
  const normalizedTitle = title.trim() || "Untitled";
  const normalizedGenre = genre.trim() || "general";
  return [
    `${COVER_STYLE_PROMPTS[style]} ${normalizedGenre} book cover for a book titled "${normalizedTitle}"`,
    userPrompt.trim(),
    COVER_LAYOUT_INSTRUCTIONS,
    "professional cover design, polished typography treatment, readable at thumbnail size",
  ].join(" ");
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, response } = await requireAuthorRoleForApi();
  if (response) return response;
  if (!user) return apiError(E_UNAUTHORIZED, 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(E_INVALID_JSON, 400);
  }

  const parsed = coverGenerateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(E_VALIDATION_FAILED, 400, {
      detail: parsed.error.flatten().fieldErrors,
    });
  }

  const prompt = parsed.data.prompt.trim();
  if (!prompt) {
    return apiError(E_PROMPT_TEXT_REQUIRED, 400);
  }

  const { id: bookId } = await params;
  const admin = createAdminClient();
  const { data: book, error: bookError } = await admin
    .from("books")
    .select("id, title")
    .eq("id", bookId)
    .eq("author_id", user.id)
    .maybeSingle();

  if (bookError) {
    console.error("[cover generate] load book failed:", bookError.message);
    return apiError(E_DATABASE_ERROR, 500);
  }
  if (!book) {
    return apiError(E_BOOK_NOT_FOUND, 404);
  }

  const { data: bookGenreRows, error: bookGenresError } = await admin
    .from("book_genres")
    .select("genre_id")
    .eq("book_id", bookId);

  if (bookGenresError) {
    console.error("[cover generate] load book genres failed:", bookGenresError.message);
    return apiError(E_DATABASE_ERROR, 500);
  }

  const genreIds = (bookGenreRows ?? [])
    .map((row) => String((row as { genre_id?: string | null }).genre_id ?? "").trim())
    .filter(Boolean);

  let genres: Array<{ name_en?: string | null; name_sv?: string | null; slug?: string | null }> = [];
  if (genreIds.length > 0) {
    const { data: genreRows, error: genresError } = await admin
      .from("genres")
      .select("name_en, name_sv, slug")
      .in("id", genreIds);

    if (genresError) {
      console.error("[cover generate] load genres failed:", genresError.message);
      return apiError(E_DATABASE_ERROR, 500);
    }

    genres = (genreRows ?? []) as Array<{ name_en?: string | null; name_sv?: string | null; slug?: string | null }>;
  }

  try {
    const { requestId, imageUrls } = await generateCoverImages({
      prompt: buildCoverPrompt({
        title: String((book as { title?: string | null }).title ?? ""),
        genre: getPrimaryGenreLabel(genres),
        userPrompt: prompt,
        style: parsed.data.style,
      }),
    });

    return NextResponse.json({
      requestId,
      images: imageUrls,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Higgsfield error";
    console.error("[cover generate] higgsfield generation failed:", message);
    return apiError(E_COVER_GENERATION_FAILED, 502);
  }
}
