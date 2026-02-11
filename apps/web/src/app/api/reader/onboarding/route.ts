import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  apiError,
  E_NOT_AUTHENTICATED,
  E_INVALID_JSON,
  E_VALIDATION_FAILED,
  E_ONBOARDING_SAVE_FAILED,
} from "@/lib/api-errors";

const onboardingBodySchema = z.object({
  genres: z.array(z.string()),
  preferences: z
    .object({
      fiction_ratio: z.number().min(0).max(1).optional(),
      reading_speed: z.enum(["slow", "medium", "fast"]).optional(),
      languages: z.array(z.string()).optional(),
    })
    .optional(),
});

export async function POST(request: Request) {
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

  const parsed = onboardingBodySchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(E_VALIDATION_FAILED, 400);
  }

  const { genres, preferences } = parsed.data;

  // Read current profile preferences
  const { data: profile } = await supabase
    .from("profiles")
    .select("preferences")
    .eq("user_id", user.id)
    .maybeSingle();

  const existingPrefs =
    profile?.preferences && typeof profile.preferences === "object" && !Array.isArray(profile.preferences)
      ? (profile.preferences as Record<string, unknown>)
      : {};

  const nextPreferences: Record<string, unknown> = {
    ...existingPrefs,
    onboarding: {
      genres,
      ...preferences,
      completedAt: new Date().toISOString(),
    },
  };

  const { error: upsertError } = await supabase.from("profiles").upsert(
    {
      user_id: user.id,
      preferences: nextPreferences,
    },
    { onConflict: "user_id" }
  );

  if (upsertError) {
    console.error("[onboarding] save failed", {
      userId: user.id,
      message: upsertError.message,
      code: upsertError.code,
    });
    return apiError(E_ONBOARDING_SAVE_FAILED, 500);
  }

  return NextResponse.json({ ok: true });
}
