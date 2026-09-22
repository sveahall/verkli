import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Account · Settings" };

export default async function AccountSettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <section aria-labelledby="settings-account-title" className="overflow-hidden rounded-3xl border border-border bg-card p-5 sm:p-7">
      <h2 id="settings-account-title" className="font-display text-xl font-medium">Account</h2>
      <p className="mt-2 text-sm text-muted-foreground">Your sign-in details for Verkli.</p>

      <div className="mt-5 space-y-2">
        <label htmlFor="author-settings-email" className="text-sm font-medium">Email</label>
        <input
          id="author-settings-email"
          type="email"
          value={user?.email ?? ""}
          readOnly
          aria-describedby="settings-email-hint"
          className="input-base min-h-11 bg-muted/40 text-base text-muted-foreground sm:text-sm"
        />
        <p id="settings-email-hint" className="text-xs text-muted-foreground">
          Your account email is shown here for reference.
        </p>
      </div>

      <div className="mt-7 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6">
        <div>
          <h3 className="text-sm font-medium">Public author profile</h3>
          <p className="mt-1 text-sm text-muted-foreground">Your name, bio and links — what readers see.</p>
        </div>
        <Link
          href="/author/profile"
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium transition-colors hover:bg-accent"
        >
          Edit profile
          <ArrowUpRight size={15} />
        </Link>
      </div>
    </section>
  );
}
