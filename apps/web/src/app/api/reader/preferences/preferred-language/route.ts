import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isSupportedLanguage } from "@/lib/languages";
import {
  apiError,
  E_NOT_AUTHENTICATED,
  E_VALIDATION_FAILED,
  E_GENERIC_ERROR,
} from "@/lib/api-errors";

// Persist the reader's preferred language for a specific book.
// Storage shape:
//   profiles.preferences.preferredLanguageByBook[bookId] = "en" | "sv" | ...
//
// Best-effort: if the row doesn't exist or write fails, we still return
// success-ish (the language switcher already optimistically navigated, and a
// preference miss costs nothing).

export const runtime = "nodejs";

const bodySchema = z.object({
  bookId: z.string().uuid(),
  language: z.string().min(2).max(8),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError(E_NOT_AUTHENTICATED, 401);

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return apiError(E_VALIDATION_FAILED, 400);

  const { bookId, language } = parsed.data;
  if (!isSupportedLanguage(language)) {
    return apiError(E_VALIDATION_FAILED, 400);
  }

  const { data: profile, error: loadError } = await supabase
    .from("profiles")
    .select("preferences")
    .eq("user_id", user.id)
    .maybeSingle();

  if (loadError) {
    console.warn("[reader.preferred-language] load failed", {
      userId: user.id,
      message: loadError.message,
    });
    return apiError(E_GENERIC_ERROR, 500);
  }

  const existingPrefs = isRecord(profile?.preferences)
    ? (profile.preferences as Record<string, unknown>)
    : {};

  const existingMap = isRecord(existingPrefs.preferredLanguageByBook)
    ? (existingPrefs.preferredLanguageByBook as Record<string, unknown>)
    : {};

  const nextPreferences = {
    ...existingPrefs,
    preferredLanguageByBook: {
      ...existingMap,
      [bookId]: language,
    },
  };

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ preferences: nextPreferences })
    .eq("user_id", user.id);

  if (updateError) {
    console.warn("[reader.preferred-language] update failed", {
      userId: user.id,
      message: updateError.message,
    });
    return apiError(E_GENERIC_ERROR, 500);
  }

  return NextResponse.json({ ok: true, bookId, language });
}
