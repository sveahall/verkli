import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import AccountEmailSection from "@/components/author/settings/AccountEmailSection";
import { UsageMeter } from "@/components/billing/UsageMeter";

export const metadata = { title: "Account \u00b7 Settings" };

export default async function AccountSettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <>
      <UsageMeter state={{ mode: "beta" }} />
      <AccountEmailSection currentEmail={user?.email ?? ""} />

      <section
        className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border p-5 sm:p-6"
        aria-labelledby="settings-profile-title"
      >
        <div>
          <h2 id="settings-profile-title" className="text-sm font-medium">Public author profile</h2>
          <p className="mt-1 text-sm text-muted-foreground">Your name, bio and links \u2014 what readers see.</p>
        </div>
        <Link
          href="/author/profile"
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium transition-colors hover:bg-accent"
        >
          Edit profile
          <ArrowUpRight size={15} />
        </Link>
      </section>
    </>
  );
}
