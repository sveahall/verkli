import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  apiError,
  E_NOT_AUTHENTICATED,
  E_INVALID_JSON,
  E_VALIDATION_FAILED,
  E_READER_SETTINGS_LOAD_FAILED,
  E_READER_SETTINGS_SAVE_FAILED,
} from "@/lib/api-errors";

const readerSettingsSchema = z.object({
  font_family: z.enum(["serif", "sans", "mono"]).optional(),
  fontFamily: z.enum(["serif", "sans", "mono"]).optional(),
  font_size: z.number().min(12).max(32).optional(),
  fontSize: z.number().min(12).max(32).optional(),
  theme: z.enum(["light", "dark", "sepia"]).optional(),
  line_height: z.number().min(1.0).max(3.0).optional(),
  lineHeight: z.number().min(1.0).max(3.0).optional(),
  content_width: z.enum(["narrow", "medium", "wide"]).optional(),
  contentWidth: z.enum(["narrow", "medium", "wide"]).optional(),
});

type ReaderSettingsRow = {
  font_family: string | null;
  font_size: number | null;
  theme: string | null;
  line_height: number | null;
  content_width: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractReaderSettings(preferences: unknown): ReaderSettingsRow {
  const defaults: ReaderSettingsRow = {
    font_family: "serif",
    font_size: 18,
    theme: "light",
    line_height: 1.7,
    content_width: "medium",
  };

  if (!isRecord(preferences)) return defaults;
  const reader = preferences.reader;
  if (!isRecord(reader)) return defaults;
  const settings = reader.settings;
  if (!isRecord(settings)) return defaults;

  return {
    font_family: typeof settings.font_family === "string" ? settings.font_family : (typeof settings.fontFamily === "string" ? settings.fontFamily : defaults.font_family),
    font_size: typeof settings.font_size === "number" ? settings.font_size : (typeof settings.fontSize === "number" ? settings.fontSize : defaults.font_size),
    theme: typeof settings.theme === "string" ? settings.theme : defaults.theme,
    line_height: typeof settings.line_height === "number" ? settings.line_height : (typeof settings.lineHeight === "number" ? settings.lineHeight : defaults.line_height),
    content_width: typeof settings.content_width === "string" ? settings.content_width : (typeof settings.contentWidth === "string" ? settings.contentWidth : defaults.content_width),
  };
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError(E_NOT_AUTHENTICATED, 401);
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("preferences")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[reader-settings] load failed", {
      userId: user.id,
      message: error.message,
    });
    return apiError(E_READER_SETTINGS_LOAD_FAILED, 500);
  }

  const settings = extractReaderSettings(profile?.preferences);

  return NextResponse.json({ ok: true, settings });
}

export async function PUT(request: Request) {
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

  const parsed = readerSettingsSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(E_VALIDATION_FAILED, 400);
  }

  const updates = parsed.data;

  // Read current preferences
  const { data: profile } = await supabase
    .from("profiles")
    .select("preferences")
    .eq("user_id", user.id)
    .maybeSingle();

  const existingPrefs = isRecord(profile?.preferences) ? (profile.preferences as Record<string, unknown>) : {};
  const existingReader = isRecord(existingPrefs.reader) ? (existingPrefs.reader as Record<string, unknown>) : {};
  const existingSettings = isRecord(existingReader.settings) ? (existingReader.settings as Record<string, unknown>) : {};

  const nextSettings: Record<string, unknown> = {
    ...existingSettings,
  };

  const fontFamily = updates.font_family ?? updates.fontFamily;
  const fontSize = updates.font_size ?? updates.fontSize;
  const lineHeight = updates.line_height ?? updates.lineHeight;
  const contentWidth = updates.content_width ?? updates.contentWidth;

  // Map settings to both current reader keys and legacy snake_case keys.
  if (fontFamily !== undefined) {
    nextSettings.fontFamily = fontFamily;
    nextSettings.font_family = fontFamily;
  }
  if (fontSize !== undefined) {
    nextSettings.fontSize = fontSize;
    nextSettings.font_size = fontSize;
  }
  if (updates.theme !== undefined) {
    nextSettings.theme = updates.theme;
  }
  if (lineHeight !== undefined) {
    nextSettings.lineHeight = lineHeight;
    nextSettings.line_height = lineHeight;
  }
  if (contentWidth !== undefined) {
    nextSettings.contentWidth = contentWidth;
    nextSettings.content_width = contentWidth;
  }

  const nextPreferences: Record<string, unknown> = {
    ...existingPrefs,
    reader: {
      ...existingReader,
      settings: nextSettings,
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
    console.error("[reader-settings] save failed", {
      userId: user.id,
      message: upsertError.message,
      code: upsertError.code,
    });
    return apiError(E_READER_SETTINGS_SAVE_FAILED, 500);
  }

  return NextResponse.json({ ok: true, settings: extractReaderSettings(nextPreferences) });
}
