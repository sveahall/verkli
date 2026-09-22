import { createClient } from "@/lib/supabase/server";
import AiSettingsSection from "@/features/ai-team/settings/AiSettingsSection";
import { getAiSettings } from "@/features/ai-team/settings/server";
import { DEFAULT_AI_SETTINGS } from "@/features/ai-team/settings/contracts";

export const metadata = { title: "AI · Settings" };

export default async function AiSettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // A settings row that cannot be read falls back to defaults so the page still
  // renders. The route-level guard is what protects spending; this only keeps
  // the form usable during an outage.
  const settings = user
    ? await getAiSettings(supabase, user.id).catch(() => DEFAULT_AI_SETTINGS)
    : DEFAULT_AI_SETTINGS;

  return <AiSettingsSection settings={settings} />;
}
