import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import SubscriptionPlanSection from "@/components/author/settings/SubscriptionPlanSection";

export const metadata = { title: "Billing & subscriptions · Settings" };

export default async function BillingSettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: plan } = user
    ? await supabase
        .from("author_subscription_plans")
        .select("enabled, price_monthly, currency, description")
        .eq("author_id", user.id)
        .maybeSingle()
    : { data: null };

  const subscriptionPlan = plan as {
    enabled: boolean;
    price_monthly: number;
    currency: string;
    description: string | null;
  } | null;

  return (
    <section aria-labelledby="settings-billing-title" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4 px-1">
        <div>
          <h2 id="settings-billing-title" className="font-display text-xl font-medium">Billing &amp; subscriptions</h2>
          <p className="mt-2 text-sm text-muted-foreground">Manage your Verkli plan and reader memberships.</p>
        </div>
        <Link
          href="/author/billing"
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium transition-colors hover:bg-accent"
        >
          Open billing
          <ArrowUpRight size={15} />
        </Link>
      </div>
      <SubscriptionPlanSection
        initialEnabled={subscriptionPlan?.enabled ?? false}
        initialPriceMonthly={subscriptionPlan?.price_monthly ?? 4900}
        initialCurrency={subscriptionPlan?.currency ?? "sek"}
        initialDescription={subscriptionPlan?.description ?? null}
      />
    </section>
  );
}
