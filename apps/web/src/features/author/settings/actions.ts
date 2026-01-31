"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updateActiveRole } from "@/features/auth/roles";
import { SOFT_DENIAL_COPY } from "@/lib/copy-rules";

export type ActionState = {
  ok: boolean;
  message: string;
};

const usernamePattern = /^[a-z0-9._-]+$/;

const normalizeUsername = (value: string) => value.trim().toLowerCase();

export async function updateAccount(prevState: ActionState, formData: FormData): Promise<ActionState> {
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
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, message: SOFT_DENIAL_COPY.ACCESS_RESTRICTED };
  }

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

export async function updateProfile(prevState: ActionState, formData: FormData): Promise<ActionState> {
  const bio = String(formData.get("bio") || "").trim();
  const avatarUrl = String(formData.get("avatar_url") || "").trim();
  const isPublic = String(formData.get("is_public") || "true") === "true";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, message: SOFT_DENIAL_COPY.ACCESS_RESTRICTED };
  }

  const { error } = await supabase
    .from("profiles")
    .upsert(
      {
        user_id: user.id,
        bio: bio || null,
        avatar_url: avatarUrl || null,
        is_public: isPublic,
      },
      { onConflict: "user_id" }
    );

  if (error) {
    return { ok: false, message: "Could not save profile settings." };
  }

  revalidatePath("/author/profile");
  revalidatePath("/author/settings");

  return { ok: true, message: "Profile updated." };
}

export async function updatePreferences(prevState: ActionState, formData: FormData): Promise<ActionState> {
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
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, message: SOFT_DENIAL_COPY.ACCESS_RESTRICTED };
  }

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

export async function switchRoleToReader(): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/author/signin");
  }

  await updateActiveRole("reader");

  revalidatePath("/author");
  redirect("/reader/home");
}

export async function changePassword(prevState: ActionState, formData: FormData): Promise<ActionState> {
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
    return { ok: false, message: SOFT_DENIAL_COPY.ACCESS_RESTRICTED };
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
