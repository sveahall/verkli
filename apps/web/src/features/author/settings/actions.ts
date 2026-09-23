"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updateActiveRole } from "@/features/auth/roles";
import { ACTIVE_ROLE_COOKIE } from "@/lib/active-role";
import { requireAuthorRole } from "@/lib/auth/require-author";
import type { Json } from "@/lib/supabase/types";
import { parseAiSettingsForm } from "@/features/ai-team/settings/contracts";
import { AiSettingsError, saveAiSettings } from "@/features/ai-team/settings/server";

export type ActionState = {
  ok: boolean;
  message: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Update profiles.avatar_url with storage path only (called after avatar upload). */
export async function updateAvatarPath(path: string): Promise<ActionState> {
  // SECURITY: Require author role for author settings
  const roleCheck = await requireAuthorRole();
  if (!roleCheck.ok) {
    return { ok: false, message: roleCheck.error };
  }
  const user = roleCheck.user;

  const supabase = await createClient();

  const { error } = await supabase
    .from("profiles")
    .upsert(
      { user_id: user.id, avatar_url: path },
      { onConflict: "user_id" }
    );

  if (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[avatar profile update failed]", error);
    }
    return { ok: false, message: "Could not save avatar." };
  }

  revalidatePath("/author/profile");
  revalidatePath("/author/settings");
  return { ok: true, message: "Avatar saved." };
}

/** Update profiles.cover_image with storage path only (called after cover upload). */
export async function updateCoverImagePath(path: string): Promise<ActionState> {
  const roleCheck = await requireAuthorRole();
  if (!roleCheck.ok) {
    return { ok: false, message: roleCheck.error };
  }
  const user = roleCheck.user;

  const supabase = await createClient();

  const { error } = await supabase
    .from("profiles")
    .upsert(
      { user_id: user.id, cover_image: path },
      { onConflict: "user_id" }
    );

  if (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[cover image profile update failed]", error);
    }
    return { ok: false, message: "Could not save cover image." };
  }

  revalidatePath("/author/profile");
  return { ok: true, message: "Cover image saved." };
}

export async function saveAuthorProfile(
  prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  void prevState;

  const roleCheck = await requireAuthorRole();
  if (!roleCheck.ok) {
    return { ok: false, message: roleCheck.error };
  }

  const user = roleCheck.user;
  const displayName = String(formData.get("display_name") || "").trim();
  const bio = String(formData.get("bio") || "").trim();
  const isPublic = String(formData.get("is_public") || "true") === "true";
  const websiteUrl = String(formData.get("website_url") || "").trim() || null;
  const twitterHandle = String(formData.get("social_twitter") || "").trim().replace(/^@/, "") || null;
  const instagramHandle = String(formData.get("social_instagram") || "").trim().replace(/^@/, "") || null;
  const tiktokHandle = String(formData.get("social_tiktok") || "").trim().replace(/^@/, "") || null;

  if (!displayName) {
    return { ok: false, message: "Display name is required." };
  }

  const socialLinks = {
    ...(twitterHandle ? { twitter: twitterHandle } : {}),
    ...(instagramHandle ? { instagram: instagramHandle } : {}),
    ...(tiktokHandle ? { tiktok: tiktokHandle } : {}),
  };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .upsert(
      {
        user_id: user.id,
        display_name: displayName,
        bio: bio || null,
        is_public: isPublic,
        website_url: websiteUrl,
        social_links: socialLinks,
      },
      { onConflict: "user_id" }
    );

  if (error) {
    return { ok: false, message: "Could not save profile." };
  }

  await supabase.auth.updateUser({
    data: {
      full_name: displayName,
    },
  });

  revalidatePath("/author/profile");
  revalidatePath("/author/settings");

  return { ok: true, message: "Profile saved." };
}

/**
 * Read-merge-write one slice of `profiles.preferences`.
 *
 * Settings live on separate pages now, so each form posts only its own fields.
 * That makes a blind `upsert` of the whole blob destructive: saving
 * Notifications would post no language and reset Publishing defaults. Every
 * action therefore mutates a copy of what is stored and writes that back.
 *
 * The read and the write are not one statement, so two sections saved in two
 * tabs within the same moment can still have the later write win. That is a
 * narrow, same-user race with no data loss beyond one re-save, and closing it
 * would mean a jsonb-merge RPC for a preference blob — not worth the migration.
 */
async function updatePreferences(
  userId: string,
  mutate: (current: Record<string, unknown>) => Record<string, unknown>
): Promise<{ ok: true } | { ok: false; message: string }> {
  const supabase = await createClient();
  const { data: profile, error: readError } = await supabase
    .from("profiles")
    .select("preferences")
    .eq("user_id", userId)
    .maybeSingle();

  if (readError) {
    return { ok: false, message: "Could not read your current settings. Nothing was changed." };
  }

  const current = isRecord(profile?.preferences)
    ? (profile.preferences as Record<string, unknown>)
    : {};

  const { error } = await supabase
    .from("profiles")
    // `preferences` is a jsonb column typed as `Json`; the mutator works in
    // plain records because that is what the callers spread into.
    .upsert(
      { user_id: userId, preferences: mutate(current) as Json },
      { onConflict: "user_id" }
    );

  if (error) {
    return { ok: false, message: "Could not save settings." };
  }

  revalidatePath("/author/settings", "layout");
  return { ok: true };
}

export async function savePublishingDefaults(
  prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  void prevState;

  const roleCheck = await requireAuthorRole();
  if (!roleCheck.ok) {
    return { ok: false, message: roleCheck.error };
  }

  const defaultLanguage = String(formData.get("default_language") || "sv").trim() || "sv";
  const defaultVisibility =
    String(formData.get("default_visibility") || "public").trim() || "public";

  const result = await updatePreferences(roleCheck.user.id, (current) => ({
    ...current,
    default_language: defaultLanguage,
    default_visibility: defaultVisibility,
    visibility: {
      shelves: defaultVisibility,
      books: defaultVisibility,
    },
  }));

  return result.ok
    ? { ok: true, message: "Publishing defaults saved." }
    : { ok: false, message: result.message };
}

export async function saveNotificationPreferences(
  prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  void prevState;

  const roleCheck = await requireAuthorRole();
  if (!roleCheck.ok) {
    return { ok: false, message: roleCheck.error };
  }

  const emailNotifications = String(formData.get("email_notifications") || "false") === "true";

  const result = await updatePreferences(roleCheck.user.id, (current) => ({
    ...current,
    notifications: {
      ...(isRecord(current.notifications) ? (current.notifications as Record<string, unknown>) : {}),
      email: emailNotifications,
    },
  }));

  return result.ok
    ? { ok: true, message: "Notification preferences saved." }
    : { ok: false, message: result.message };
}

export async function changePassword(
  prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  void prevState;

  const roleCheck = await requireAuthorRole();
  if (!roleCheck.ok) {
    return { ok: false, message: roleCheck.error };
  }

  const password = String(formData.get("new_password") || "");
  const confirmPassword = String(formData.get("confirm_password") || "");

  if (!password && !confirmPassword) {
    return { ok: false, message: "Enter a new password in both fields." };
  }
  if (password.length < 8) {
    return { ok: false, message: "Password must be at least 8 characters." };
  }
  if (password !== confirmPassword) {
    return { ok: false, message: "Passwords do not match." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { ok: false, message: "Could not update password." };
  }

  return { ok: true, message: "Password updated." };
}

export async function saveAiPreferences(
  prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  void prevState;

  const roleCheck = await requireAuthorRole();
  if (!roleCheck.ok) {
    return { ok: false, message: roleCheck.error };
  }

  const parsed = parseAiSettingsForm(formData);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path.join(".") ?? "AI settings";
    return { ok: false, message: `Check your AI settings (${field}) and try again.` };
  }

  const supabase = await createClient();
  try {
    await saveAiSettings(supabase, roleCheck.user.id, parsed.data);
  } catch (error) {
    return {
      ok: false,
      message: error instanceof AiSettingsError ? error.message : "Could not save your AI settings.",
    };
  }

  // The author layout reads `ai_enabled` to decide which AI surfaces render, so
  // the whole author tree — not just this page — has to be revalidated.
  revalidatePath("/author", "layout");
  return { ok: true, message: parsed.data.aiEnabled ? "AI settings saved." : "AI is now off for your account." };
}

export async function switchRoleToReader(): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/author/signin");
  }

  const result = await updateActiveRole("reader");

  if (!result.ok) {
    console.error("[author settings] failed to switch role to reader", {
      userId: user.id,
      error: result.error,
    });
    redirect("/author/settings");
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ROLE_COOKIE, "reader", {
    path: "/",
    sameSite: "lax",
    maxAge: 31536000,
  });

  revalidatePath("/author");
  redirect("/reader/home");
}

export async function signOutAllSessions(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "global" });
  redirect("/author/signin");
}
