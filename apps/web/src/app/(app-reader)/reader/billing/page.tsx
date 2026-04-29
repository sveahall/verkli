import { BillingPageClient } from "@/components/billing/BillingPageClient";
import type { PlanCard } from "@/components/billing/BillingPageContent";
import { getBillingStateForUser } from "@/lib/billing/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const READER_PLAN_CARDS: PlanCard[] = [
  {
    id: "plus",
    name: "Verkli Plus",
    description: "For readers who want more from their reading experience.",
    bullets: [
      "Priority support",
      "Offline reading",
      "Access to Plus features in the app",
    ],
  },
];

type Props = { searchParams: Promise<{ [key: string]: string | string[] | undefined }> };

export default async function ReaderBillingPage({ searchParams }: Props) {
  const params = await searchParams;
  const checkout = typeof params.checkout === "string" ? params.checkout : null;
  const sessionId = typeof params.session_id === "string" ? params.session_id : null;

  let initialBillingState = null;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user?.id) {
    const loaded = await getBillingStateForUser(user.id, "reader");
    if (loaded.ok) initialBillingState = loaded.state;
  }

  return (
    <BillingPageClient
      planCards={READER_PLAN_CARDS}
      title="Subscription"
      subtitle="Manage Verkli Plus for readers."
      pastDueMessage="Your payment is overdue. Update your subscription to reactivate Plus features."
      initialCheckout={checkout}
      initialSessionId={sessionId}
      initialBillingState={initialBillingState}
    />
  );
}
