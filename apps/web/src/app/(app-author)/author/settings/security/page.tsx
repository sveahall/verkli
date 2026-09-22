import { createClient } from "@/lib/supabase/server";
import SecuritySection from "@/components/author/settings/SecuritySection";
import DeleteAccountSection from "@/components/author/settings/DeleteAccountSection";

export const metadata = { title: "Security \u00b7 Settings" };

export default async function SecuritySettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = user
    ? await supabase.from("profiles").select("deletion_requested_at").eq("user_id", user.id).maybeSingle()
    : { data: null };

  return (
    <>
      <SecuritySection />
      <DeleteAccountSection requestedAt={(profile as { deletion_requested_at?: string | null } | null)?.deletion_requested_at ?? null} />
    </>
  );
}
