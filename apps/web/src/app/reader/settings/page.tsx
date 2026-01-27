import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ReaderSettingsForm from "@/components/reader/ReaderSettingsForm";
import type { Profile } from "@/lib/supabase/types";

export default async function ReaderSettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/reader/signin");
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
    "Reader";

  const username =
    profile?.username ||
    user.user_metadata?.username ||
    user.email?.split("@")[0] ||
    "reader";

  return (
    <main className="min-h-screen bg-[#050508] text-white">
      <div className="mx-auto w-full max-w-[1000px] px-6 py-12">
        <header className="mb-10">
          <h1 className="text-[28px] font-semibold">Reader settings</h1>
          <p className="mt-2 text-[14px] text-white/50">Update your reader profile and preferences.</p>
        </header>

        <ReaderSettingsForm
          userId={user.id}
          email={user.email || ""}
          initialProfile={{
            displayName,
            username,
            bio: profile?.bio || "",
            avatarUrl: profile?.avatar_url || user.user_metadata?.avatar_url || "",
            isPublic: profile?.is_public ?? true,
          }}
        />
      </div>
    </main>
  );
}
