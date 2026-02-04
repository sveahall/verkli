import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SettingsPage from "@/components/author/settings/SettingsPage";
<<<<<<< HEAD
import { getAvatarUrlFromPathServer } from "@/lib/supabase/avatar";
import type { Profile } from "@/lib/supabase/types";

export default async function authorSettingsRoute() {
=======
import type { Profile } from "@/lib/supabase/types";

export default async function AuthorSettingsRoute() {
>>>>>>> main
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/author/signin");
  }

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  const profile = profileRow as Profile | null;
<<<<<<< HEAD
  const avatarPath = profile?.avatar_url ?? null;
  const avatarUrl =
    (await getAvatarUrlFromPathServer(avatarPath)) ||
    user.user_metadata?.avatar_url ||
    "";
=======
>>>>>>> main

  const displayName =
    profile?.display_name ||
    user.user_metadata?.full_name ||
    user.email?.split("@")[0] ||
<<<<<<< HEAD
    "author";
=======
    "Author";
>>>>>>> main

  const username =
    profile?.username ||
    user.user_metadata?.username ||
    user.email?.split("@")[0] ||
    "author";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SettingsPage
        user={{
          id: user.id,
          email: user.email || "",
        }}
        profile={{
          displayName,
          username,
          bio: profile?.bio || "",
<<<<<<< HEAD
          avatarUrl,
=======
          avatarUrl: profile?.avatar_url || user.user_metadata?.avatar_url || "",
>>>>>>> main
          isPublic: profile?.is_public ?? true,
          role: profile?.role || (user.user_metadata?.role ?? "author"),
          preferences: profile?.preferences || {},
        }}
      />
    </div>
  );
}
