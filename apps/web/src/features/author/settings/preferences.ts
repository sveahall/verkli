import type { SupabaseClient } from "@supabase/supabase-js";

export type AuthorPreferences = {
  defaultLanguage: string;
  defaultVisibility: string;
  emailNotifications: boolean;
};

export const DEFAULT_AUTHOR_PREFERENCES: AuthorPreferences = {
  defaultLanguage: "sv",
  defaultVisibility: "public",
  emailNotifications: true,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Read the settings slice of `profiles.preferences`.
 *
 * Shared by the pages that render it and kept separate from the actions module
 * so a server component can import it without pulling in "use server". The
 * shape has drifted over time — `default_visibility` used to live under
 * `visibility.books` / `visibility.shelves` — so both spellings are still read.
 */
export async function readPreferences(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the caller's typed client varies; only `profiles.preferences` is read.
  client: SupabaseClient<any, any, any>,
  userId: string | undefined
): Promise<AuthorPreferences> {
  if (!userId) return DEFAULT_AUTHOR_PREFERENCES;

  const { data } = await client
    .from("profiles")
    .select("preferences")
    .eq("user_id", userId)
    .maybeSingle();

  const preferences = isRecord(data?.preferences) ? (data.preferences as Record<string, unknown>) : {};
  const visibility = isRecord(preferences.visibility) ? (preferences.visibility as Record<string, unknown>) : {};
  const notifications = isRecord(preferences.notifications)
    ? (preferences.notifications as Record<string, unknown>)
    : {};

  const language = typeof preferences.default_language === "string" ? preferences.default_language.trim() : "";
  const declaredVisibility =
    typeof preferences.default_visibility === "string" ? preferences.default_visibility.trim() : "";
  const legacyVisibility =
    (typeof visibility.books === "string" && visibility.books) ||
    (typeof visibility.shelves === "string" && visibility.shelves) ||
    "";

  return {
    defaultLanguage: language || DEFAULT_AUTHOR_PREFERENCES.defaultLanguage,
    defaultVisibility: declaredVisibility || legacyVisibility || DEFAULT_AUTHOR_PREFERENCES.defaultVisibility,
    emailNotifications:
      typeof notifications.email === "boolean"
        ? notifications.email
        : DEFAULT_AUTHOR_PREFERENCES.emailNotifications,
  };
}
