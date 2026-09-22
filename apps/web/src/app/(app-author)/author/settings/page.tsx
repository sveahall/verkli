import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SettingsPage from "@/components/author/settings/SettingsPage";
import SubscriptionPlanSection from "@/components/author/settings/SubscriptionPlanSection";
import type { Tables } from "@/lib/supabase/types";
import { getAiSettings } from "@/features/ai-team/settings/server";
import { DEFAULT_AI_SETTINGS } from "@/features/ai-team/settings/contracts";

type Profile = Tables<"profiles">;

export default async function authorSettingsRoute() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/author/signin");
  }

  // A settings row that cannot be read must not silently render as "AI on":
  // falling back to defaults here would show the wrong switch position to the
  // one author who turned it off. The route-level guard is what protects
  // spending; this fallback only keeps the page renderable.
  const aiSettings = await getAiSettings(supabase, user.id).catch(() => DEFAULT_AI_SETTINGS);

  const [{ data: profileRow }, { data: subscriptionPlan }] = await Promise.all([
    supabase
      .from("profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("author_subscription_plans")
      .select("enabled, price_monthly, currency, description")
      .eq("author_id", user.id)
      .maybeSingle(),
  ]);

  const profile = profileRow as Profile | null;
  const plan = subscriptionPlan as {
    enabled: boolean;
    price_monthly: number;
    currency: string;
    description: string | null;
  } | null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SettingsPage
        user={{ email: user.email || "" }}
        aiSettings={aiSettings}
        profile={{
          preferences: (profile?.preferences && typeof profile.preferences === "object" && !Array.isArray(profile.preferences)
            ? profile.preferences
            : {}) as Record<string, unknown>,
        }}
        subscriptionPlanSection={
          <SubscriptionPlanSection
            initialEnabled={plan?.enabled ?? false}
            initialPriceMonthly={plan?.price_monthly ?? 4900}
            initialCurrency={plan?.currency ?? "sek"}
            initialDescription={plan?.description ?? null}
          />
        }
      />
    </div>
  );
}
