import { createClient } from "@/lib/supabase/server";
import NotificationsSection from "@/components/author/settings/NotificationsSection";
import { readPreferences } from "@/features/author/settings/preferences";

export const metadata = { title: "Notifications · Settings" };

export default async function NotificationsSettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const preferences = await readPreferences(supabase, user?.id);

  return <NotificationsSection initialEmail={preferences.emailNotifications} />;
}
