import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/supabase/types";

export default async function ReaderProfilePage() {
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

  const bio = profile?.bio || "Tell people what you love reading.";
  const avatarUrl = profile?.avatar_url || user.user_metadata?.avatar_url || "";

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#050508] dark:text-white">
      <div className="mx-auto w-full max-w-[1000px] px-6 py-12">
        <header className="mb-10">
          <h1 className="text-[28px] font-semibold">Reader profile</h1>
          <p className="mt-2 text-[14px] text-slate-600 dark:text-white/50">Your public reader profile.</p>
        </header>

        <div className="rounded-[28px] border border-black/10 bg-black/[0.04] p-8 dark:border-white/10 dark:bg-white/[0.04]">
          <div className="flex flex-wrap items-center gap-6">
            <div className="h-24 w-24 overflow-hidden rounded-full border border-black/10 dark:border-white/10">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[28px] font-semibold text-slate-700 dark:text-white/70">
                  {displayName.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div>
              <h2 className="text-[22px] font-semibold">{displayName}</h2>
              <p className="text-[13px] text-slate-600 dark:text-white/50">@{username}</p>
              <p className="mt-3 max-w-[520px] text-[14px] text-slate-600 dark:text-white/60">{bio}</p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
