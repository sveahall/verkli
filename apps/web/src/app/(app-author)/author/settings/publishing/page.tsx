import { createClient } from "@/lib/supabase/server";
import PublishingDefaultsSection from "@/components/author/settings/PublishingDefaultsSection";
import { readPreferences } from "@/features/author/settings/preferences";

export const metadata = { title: "Publishing defaults · Settings" };

export default async function PublishingSettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const preferences = await readPreferences(supabase, user?.id);

  return (
    <PublishingDefaultsSection
      initialLanguage={preferences.defaultLanguage}
      initialVisibility={preferences.defaultVisibility}
    />
  );
}
