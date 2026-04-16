"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updateActiveRole } from "@/features/auth/roles";
import { ACTIVE_ROLE_COOKIE } from "@/lib/active-role";
import { requireAuthorRole } from "@/lib/auth/require-author";

export type ActionState = {
  ok: boolean;
  message: string;
};

const usernamePattern = /^[a-z0-9._-]+$/;

const normalizeUsername = (value: string) => value.trim().toLowerCase();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function updateAccount(prevState: ActionState, formData: FormData): Promise<ActionState> {
  void prevState;
  // SECURITY: Require author role for author settings
  const roleCheck = await requireAuthorRole();
  if (!roleCheck.ok) {
    return { ok: false, message: roleCheck.error };
  }
  const user = roleCheck.user;

  const displayName = String(formData.get("display_name") || "").trim();
  const usernameInput = String(formData.get("username") || "");
  const username = normalizeUsername(usernameInput);

  if (!displayName) {
    return { ok: false, message: "Display name is required." };
  }

  if (!username) {
    return { ok: false, message: "Username is required." };
  }

  if (!usernamePattern.test(username)) {
    return { ok: false, message: "Username can only use a-z, 0-9, dots, underscores, and dashes." };
  }

  const supabase = await createClient();

  const { error: profileError } = await supabase
    .from("profiles")
    .upsert(
      {
        user_id: user.id,
        display_name: displayName,
        username,
      },
      { onConflict: "user_id" }
    );

  if (profileError) {
    if (profileError.code === "23505") {
      return { ok: false, message: "That username is already taken." };
    }
    return { ok: false, message: "Could not save account settings." };
  }

  // Keep auth metadata in sync for fast access in the UI.
  await supabase.auth.updateUser({
    data: {
      full_name: displayName,
      username,
    },
  });

  revalidatePath("/author/profile");
  revalidatePath("/author/settings");

  return { ok: true, message: "Account updated." };
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

export async function updateProfile(prevState: ActionState, formData: FormData): Promise<ActionState> {
  void prevState;
  // SECURITY: Require author role for author settings
  const roleCheck = await requireAuthorRole();
  if (!roleCheck.ok) {
    return { ok: false, message: roleCheck.error };
  }
  const user = roleCheck.user;

  const bio = String(formData.get("bio") || "").trim();
  const isPublic = String(formData.get("is_public") || "true") === "true";

  const supabase = await createClient();

  const { error } = await supabase
    .from("profiles")
    .upsert(
      { user_id: user.id, bio: bio || null, is_public: isPublic },
      { onConflict: "user_id" }
    );

  if (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[profile update failed]", error);
    }
    return { ok: false, message: "Could not save profile settings." };
  }

  revalidatePath("/author/profile");
  revalidatePath("/author/settings");

  return { ok: true, message: "Profile updated." };
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

export async function updatePreferences(prevState: ActionState, formData: FormData): Promise<ActionState> {
  void prevState;
  // SECURITY: Require author role for author settings
  const roleCheck = await requireAuthorRole();
  if (!roleCheck.ok) {
    return { ok: false, message: roleCheck.error };
  }
  const user = roleCheck.user;

  const typography = {
    fontFamily: String(formData.get("typography_font_family") || "Inter"),
    fontWeight: String(formData.get("typography_font_weight") || "600"),
    titleSize: String(formData.get("typography_title_size") || "20px"),
    subtitleSize: String(formData.get("typography_subtitle_size") || "14px"),
    textColor: String(formData.get("typography_text_color") || "#111827"),
  };

  const preferences = {
    typography,
    cover_style: String(formData.get("cover_style") || "image"),
    visibility: {
      shelves: String(formData.get("visibility_shelves") || "public"),
      books: String(formData.get("visibility_books") || "public"),
    },
  };

  const supabase = await createClient();

  const { error } = await supabase
    .from("profiles")
    .upsert(
      {
        user_id: user.id,
        preferences,
      },
      { onConflict: "user_id" }
    );

  if (error) {
    return { ok: false, message: "Could not save preferences." };
  }

  revalidatePath("/author/profile");
  revalidatePath("/author/settings");

  return { ok: true, message: "Preferences saved." };
}

export async function saveAuthorSettings(
  prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  void prevState;

  const roleCheck = await requireAuthorRole();
  if (!roleCheck.ok) {
    return { ok: false, message: roleCheck.error };
  }

  const user = roleCheck.user;
  const defaultLanguage = String(formData.get("default_language") || "sv").trim() || "sv";
  const defaultVisibility =
    String(formData.get("default_visibility") || "public").trim() || "public";
  const emailNotifications = String(formData.get("email_notifications") || "false") === "true";
  const password = String(formData.get("new_password") || "");
  const confirmPassword = String(formData.get("confirm_password") || "");

  if (password || confirmPassword) {
    if (password.length < 8) {
      return { ok: false, message: "Password must be at least 8 characters." };
    }

    if (password !== confirmPassword) {
      return { ok: false, message: "Passwords do not match." };
    }
  }

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("preferences")
    .eq("user_id", user.id)
    .maybeSingle();

  const existingPreferences = isRecord(profile?.preferences)
    ? (profile.preferences as Record<string, unknown>)
    : {};
  const existingNotifications = isRecord(existingPreferences.notifications)
    ? (existingPreferences.notifications as Record<string, unknown>)
    : {};

  const nextPreferences = {
    ...existingPreferences,
    default_language: defaultLanguage,
    default_visibility: defaultVisibility,
    visibility: {
      shelves: defaultVisibility,
      books: defaultVisibility,
    },
    notifications: {
      ...existingNotifications,
      email: emailNotifications,
    },
  };

  const { error } = await supabase
    .from("profiles")
    .upsert(
      {
        user_id: user.id,
        preferences: nextPreferences,
      },
      { onConflict: "user_id" }
    );

  if (error) {
    return { ok: false, message: "Could not save settings." };
  }

  if (password) {
    const { error: passwordError } = await supabase.auth.updateUser({ password });
    if (passwordError) {
      return { ok: false, message: "Could not update password." };
    }
  }

  revalidatePath("/author/settings");

  return { ok: true, message: password ? "Settings and password saved." : "Settings saved." };
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

export async function changePassword(prevState: ActionState, formData: FormData): Promise<ActionState> {
  void prevState;
  const password = String(formData.get("new_password") || "");
  const confirm = String(formData.get("confirm_password") || "");

  if (password.length < 8) {
    return { ok: false, message: "Password must be at least 8 characters." };
  }

  if (password !== confirm) {
    return { ok: false, message: "Passwords do not match." };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, message: "Not authenticated." };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { ok: false, message: "Could not update password." };
  }

  return { ok: true, message: "Password updated." };
}

export async function signOutAllSessions(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "global" });
  redirect("/author/signin");
}
