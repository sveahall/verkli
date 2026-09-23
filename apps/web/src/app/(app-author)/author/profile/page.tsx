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
  const coverPath = profile?.cover_image ?? null;

  const [avatarUrl, coverImageUrl] = await Promise.all([
    getAvatarUrlFromPathServer(avatarPath).then(
      (url) => url || user.user_metadata?.avatar_url || null
    ),
    getAvatarUrlFromPathServer(coverPath),
  ]);

  const displayName =
    profile?.display_name ||
    user.user_metadata?.full_name ||
    user.email?.split("@")[0] ||
    "author";

  const socialLinks = (profile?.social_links && typeof profile.social_links === "object" && !Array.isArray(profile.social_links))
    ? (profile.social_links as Record<string, string>)
    : {};

  return (
    <div className="min-h-screen bg-background text-foreground">
      <ProfilePage
        user={{ id: user.id }}
        profile={{
          displayName,
          bio: profile?.bio?.trim() ?? "",
          avatarUrl,
          coverImageUrl,
          isPublic: profile?.is_public ?? true,
          websiteUrl: profile?.website_url ?? "",
          socialLinks: {
            twitter: socialLinks.twitter ?? "",
            instagram: socialLinks.instagram ?? "",
            tiktok: socialLinks.tiktok ?? "",
          },
        }}
      />
    </div>
  );
}
