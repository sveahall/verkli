import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SettingsPage from "@/components/writer/settings/SettingsPage";
import type { Profile } from "@/lib/supabase/types";

export default async function WriterSettingsRoute() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/writer/signin");
  }

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  const profile = profileRow as Profile | null;

  const displayName =
    profile?.display_name ||
    user.user_metadata?.full_name ||
    user.email?.split("@")[0] ||
    "Writer";

  const username =
    profile?.username ||
    user.user_metadata?.username ||
    user.email?.split("@")[0] ||
    "writer";

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
          avatarUrl: profile?.avatar_url || user.user_metadata?.avatar_url || "",
          isPublic: profile?.is_public ?? true,
          role: profile?.role || (user.user_metadata?.role ?? "writer"),
          preferences: profile?.preferences || {},
        }}
      />
    </div>
  );
}
