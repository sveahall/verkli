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

export async function signOutAllSessions(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "global" });
  redirect("/author/signin");
}
