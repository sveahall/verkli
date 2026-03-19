import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SettingsPage from "@/components/author/settings/SettingsPage";
import type { Tables } from "@/lib/supabase/types";

type Profile = Tables<"profiles">;

export default async function authorSettingsRoute() {
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

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SettingsPage
        user={{
          email: user.email || "",
        }}
        profile={{
          preferences: (profile?.preferences && typeof profile.preferences === "object" && !Array.isArray(profile.preferences)
            ? profile.preferences
            : {}) as Record<string, unknown>,
        }}
      />
    </div>
  );
}
