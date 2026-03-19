import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAvatarUrlFromPathServer } from "@/lib/supabase/avatar";
import ProfilePage from "@/components/author/profile/ProfilePage";
import type { Tables } from "@/lib/supabase/types";

type Profile = Tables<"profiles">;

export default async function AuthorProfileRoute() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/author/signin");
  }

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  const profile = profileRow as Profile | null;
  const avatarPath = profile?.avatar_url ?? null;
  const avatarUrl =
    (await getAvatarUrlFromPathServer(avatarPath)) ||
    user.user_metadata?.avatar_url ||
    null;

  const displayName =
    profile?.display_name ||
    user.user_metadata?.full_name ||
    user.email?.split("@")[0] ||
    "author";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <ProfilePage
        user={{ id: user.id }}
        profile={{
          displayName,
          bio: profile?.bio?.trim() ?? "",
          avatarUrl,
          isPublic: profile?.is_public ?? true,
        }}
      />
    </div>
  );
}
