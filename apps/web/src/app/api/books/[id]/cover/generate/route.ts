import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  FAL_STORAGE_HEADROOM_MS,
  FAL_TIMEOUT_MS,
  generateCoverImages,
} from "@/lib/fal-image";
import { createPerUserRateLimiter } from "@/lib/rate-limit";
import { isDemoFacadeEnabled } from "@/lib/flags";
import {
  apiError,
  isValidUuid,
  E_BOOK_NOT_FOUND,
  E_COVER_GENERATION_FAILED,
  E_DATABASE_ERROR,
  E_INVALID_BOOK_ID,
  E_INVALID_JSON,
  E_PROMPT_TEXT_REQUIRED,
  E_RATE_LIMIT_EXCEEDED,
  E_UNAUTHORIZED,
  E_VALIDATION_FAILED,
} from "@/lib/api-errors";

export const runtime = "nodejs";
// Vercel caps functions well below 180s on the current plan, so declaring 180
// meant a provider hang was killed by the platform instead of returning our
// own error. fal-image.ts times out at 40s; this leaves room for the storage
// uploads that follow.
export const maxDuration = 60;

const coverLimiter = createPerUserRateLimiter({ maxPerMinute: 3 });

const coverGenerateSchema = z.object({
  prompt: z.string().max(2000),
  style: z.enum(["minimal", "photographic", "illustrated", "vintage"]).default("minimal"),
});

const COVER_STYLE_PROMPTS: Record<
  z.infer<typeof coverGenerateSchema>["style"],
  string
> = {
  minimal:
    "clean minimalist artwork, Scandinavian design aesthetic, restrained muted palette, elegant negative space, soft gradients, vertical composition",
  photographic:
    "cinematic photograph, professional editorial lighting, shallow depth of field, high-end visual mood, 8k detail, vertical composition",
  illustrated:
    "expressive digital illustration, rich painterly brushwork, vivid storytelling atmosphere, detailed artistic composition, vertical format",
  vintage:
    "retro-inspired artwork, classic print texture, aged warm palette, timeless nostalgic atmosphere, mid-century aesthetic, vertical composition",
};

function getPrimaryGenreLabel(
  genres: Array<{ name_en?: string | null; name_sv?: string | null; slug?: string | null }>
): string {
  const primary = genres[0];
  const label = primary?.name_en?.trim() || primary?.name_sv?.trim() || primary?.slug?.trim();
  return label || "general";
}

function buildCoverPrompt({
  genre,
  userPrompt,
  style,
}: {
  genre: string;
  userPrompt: string;
  style: z.infer<typeof coverGenerateSchema>["style"];
}): string {
  const genreAtmosphere = genre.trim() && genre.trim() !== "general"
    ? `${genre.trim()} atmosphere`
    : "";
  return [
    COVER_STYLE_PROMPTS[style],
    genreAtmosphere,
    userPrompt.trim(),
    "no text, no letters, no words, no title, no typography, no book, no frame",
  ].filter(Boolean).join(", ");
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // Step timings. The platform kills this function at 60s with no log of its
  // own, so every step above generation is indistinguishable from every other
  // when it hangs. The first instrumentation pass sat inside generateCoverImages
  // and printed nothing — which located the problem above it, not below.
  const t0 = Date.now();
  const step = (name: string) => console.info(`[cover] ${name} at ${Date.now() - t0}ms`);

  const { user, response } = await requireAuthorRoleForApi();
  step("auth");
  if (response) return response;
  if (!user) return apiError(E_UNAUTHORIZED, 401);

  // Whitelist the investor-pitch demo profile from the 3/min cover-gen
  // rate limit. The demo flow re-rolls the cover live on stage; the limit
  // is a paranoia guard against runaway clients, not a billing gate, and
  // tripping it mid-pitch would mask a slow generation as a "blocked"
  // failure. Skipped only when the deployment flag is on AND the
  // signed-in profile is flagged demo_mode (so production users still
  // see the limit).
  let demoBypass = false;
  if (isDemoFacadeEnabled()) {
    const guardSupabase = await createClient();
    const { data: profile } = await guardSupabase
      .from("profiles")
      .select("demo_mode")
      .eq("user_id", user.id)
      .maybeSingle();
    demoBypass = Boolean(
      (profile as { demo_mode?: boolean | null } | null)?.demo_mode
    );
  }
  step("demo-guard");
  if (!demoBypass) {
    const rl = await coverLimiter.check(user.id);
    step("rate-limit");
    if (!rl.allowed) {
      return apiError(E_RATE_LIMIT_EXCEEDED, 429, { retryAfterSeconds: rl.retryAfterSeconds });
    }
  }

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
  if (!isValidUuid(bookId)) return apiError(E_INVALID_BOOK_ID, 400);

  const admin = createAdminClient();
  const { data: book, error: bookError } = await admin
    .from("books")
    .select("id")
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

  // One silent retry, but only if it can finish. The retry was written for
  // NVIDIA SD3, which returned transient 502/504s that a re-run fixed. It
  // outlived the provider: fal-image.ts caps an attempt at 40s specifically to
  // stay inside this route's 60s maxDuration, and two attempts are 80s. So
  // whenever the first attempt failed by timing out, the retry could not
  // possibly return — the function was killed at 60s and the author waited a
  // minute for "Could not generate cover options", with the real cause only in
  // the platform log as a runtime timeout. That is the exact failure the
  // 40s cap was introduced to remove, reintroduced one layer up.
  //
  // The elapsed check restores the original intent rather than dropping the
  // retry: a transient 502 fails in a second or two and leaves room, a hang
  // burns the whole budget and does not. So the thing worth retrying still is,
  // and the thing that cannot succeed fails fast and loudly.
  step("book-and-genres");
  const finalPrompt = buildCoverPrompt({
    genre: getPrimaryGenreLabel(genres),
    userPrompt: prompt,
    style: parsed.data.style,
  });
  const budgetMs = maxDuration * 1000;
  const startedAt = Date.now();
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { requestId, imageUrls } = await generateCoverImages({ prompt: finalPrompt });
      return NextResponse.json({ requestId, images: imageUrls });
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (attempt === 0) {
        const elapsedMs = Date.now() - startedAt;
        const remainingMs = budgetMs - elapsedMs;
        if (remainingMs < FAL_TIMEOUT_MS + FAL_STORAGE_HEADROOM_MS) {
          console.error(
            `[cover generate] fal.ai attempt 1 failed (${message}); skipping retry, ` +
              `${Math.round(remainingMs / 1000)}s left of a ${maxDuration}s budget is not enough for another attempt.`
          );
          break;
        }
        console.warn(
          `[cover generate] fal.ai attempt 1 failed (${message}); retrying once, ` +
            `${Math.round(remainingMs / 1000)}s of budget left.`
        );
        continue;
      }
      console.error(
        `[cover generate] fal.ai generation failed after retry: ${message}`
      );
    }
  }
  void lastError;
  return apiError(E_COVER_GENERATION_FAILED, 502);
}
