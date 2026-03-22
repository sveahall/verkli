import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { enqueueRecommendationsJob } from "@/lib/recommendations-queue";
import {
  apiError,
  E_DATABASE_ERROR,
  E_INVALID_JSON,
  E_INVALID_REQUEST_BODY,
  E_NOT_AUTHENTICATED,
} from "@/lib/api-errors";

const onboardingSchema = z.object({
  genres: z.array(z.string().min(1)).max(30).optional(),
  genreIds: z.array(z.string().min(1)).max(30).optional(),
  preferences: z
    .object({
      fiction_ratio: z.number().finite().optional(),
      reading_speed: z.number().finite().optional(),
      languages: z.array(z.string().min(1)).max(20).optional(),
    })
    .optional(),
  bookSignals: z
    .array(
      z.object({
        bookId: z.string().min(1),
        signal: z.enum(["like", "skip"]),
      })
    )
    .max(100)
    .optional(),
});

type ReaderPreferences = {
  fiction_ratio?: number;
  reading_speed?: number;
  languages?: string[];
};

function uniqueStrings(input: Array<string | null | undefined>): string[] {
  return [...new Set(input.map((item) => String(item ?? "").trim()).filter((item) => item.length > 0))];
}

function normalizeReaderPreferences(input: ReaderPreferences | undefined): ReaderPreferences {
  if (!input) return {};

  const output: ReaderPreferences = {};
  if (typeof input.fiction_ratio === "number" && Number.isFinite(input.fiction_ratio)) {
    output.fiction_ratio = input.fiction_ratio;
  }
  if (typeof input.reading_speed === "number" && Number.isFinite(input.reading_speed)) {
    output.reading_speed = input.reading_speed;
  }
  if (Array.isArray(input.languages)) {
    output.languages = uniqueStrings(input.languages.map((lang) => lang.toLowerCase()));
  }
  return output;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError(E_NOT_AUTHENTICATED, 401);
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return apiError(E_INVALID_JSON, 400);
  }

  const parsed = onboardingSchema.safeParse(rawBody);
  if (!parsed.success) {
    return apiError(E_INVALID_REQUEST_BODY, 400);
  }

  const body = parsed.data;
  const genreIds = uniqueStrings([...(body.genres ?? []), ...(body.genreIds ?? [])]);
  const preferences = normalizeReaderPreferences(body.preferences);

  // Upsert new genres first, then remove stale ones (safe against partial failure)
  if (genreIds.length > 0) {
    const rows = genreIds.map((genreId) => ({
      user_id: user.id,
      genre_id: genreId,
    }));

    const { error: upsertGenreError } = await supabase
      .from("reader_genre_preferences")
      .upsert(rows, { onConflict: "user_id,genre_id" });

    if (upsertGenreError) {
      console.error("[reader.onboarding] failed to upsert genre preferences", {
        userId: user.id,
        message: upsertGenreError.message,
      });
      return apiError(E_DATABASE_ERROR, 500);
    }

    // Remove genres no longer selected
    const { error: deleteStaleError } = await supabase
      .from("reader_genre_preferences")
      .delete()
      .eq("user_id", user.id)
      .not("genre_id", "in", `(${genreIds.join(",")})`);

    if (deleteStaleError) {
      console.error("[reader.onboarding] failed to clear stale genre preferences", {
        userId: user.id,
        message: deleteStaleError.message,
      });
      return apiError(E_DATABASE_ERROR, 500);
    }
  } else {
    // Clear all genre preferences
    const { error: clearGenreError } = await supabase
      .from("reader_genre_preferences")
      .delete()
      .eq("user_id", user.id);

    if (clearGenreError) {
      console.error("[reader.onboarding] failed to clear genre preferences", {
        userId: user.id,
        message: clearGenreError.message,
      });
      return apiError(E_DATABASE_ERROR, 500);
    }
  }

  if (body.bookSignals && body.bookSignals.length > 0) {
    const deduped = new Map<string, "like" | "skip">();
    for (const signal of body.bookSignals) {
      deduped.set(signal.bookId, signal.signal);
    }

    const signalRows = [...deduped.entries()].map(([bookId, signal]) => ({
      user_id: user.id,
      book_id: bookId,
      signal,
    }));

    const { error: signalError } = await supabase
      .from("reader_book_signals")
      .upsert(signalRows, { onConflict: "user_id,book_id" });

    if (signalError) {
      console.error("[reader.onboarding] failed to upsert book signals", {
        userId: user.id,
        message: signalError.message,
      });
      return apiError(E_DATABASE_ERROR, 500);
    }
  }

  const { data: profile, error: profileLoadError } = await supabase
    .from("profiles")
    .select("preferences")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileLoadError) {
    console.error("[reader.onboarding] failed to load profile", {
      userId: user.id,
      message: profileLoadError.message,
    });
    return apiError(E_DATABASE_ERROR, 500);
  }

  const existingPreferences = isRecord(profile?.preferences) ? profile.preferences : {};
  const existingReaderPreferences = isRecord(existingPreferences.reader_preferences)
    ? existingPreferences.reader_preferences
    : {};

  const nextPreferences = {
    ...existingPreferences,
    reader_preferences: {
      ...existingReaderPreferences,
      ...preferences,
    },
  };

  const { error: profileUpdateError } = await supabase
    .from("profiles")
    .update({
      onboarding_completed_at: new Date().toISOString(),
      preferences: nextPreferences,
    })
    .eq("user_id", user.id);

  if (profileUpdateError) {
    console.error("[reader.onboarding] failed to update profile", {
      userId: user.id,
      message: profileUpdateError.message,
    });
    return apiError(E_DATABASE_ERROR, 500);
  }

  let recommendationsJobId: string | null = null;
  try {
    recommendationsJobId = await enqueueRecommendationsJob({
      userId: user.id,
      trigger: "manual",
    });
  } catch (err) {
    console.warn("[reader.onboarding] recommendations enqueue failed", {
      userId: user.id,
      message: err instanceof Error ? err.message : String(err),
    });
  }

  return NextResponse.json({
    ok: true,
    genreCount: genreIds.length,
    queued: Boolean(recommendationsJobId),
    recommendationsJobId,
  });
}
