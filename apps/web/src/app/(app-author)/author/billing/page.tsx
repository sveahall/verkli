import { BillingPageClient } from "@/components/billing/BillingPageClient";
import type { PlanCard } from "@/components/billing/BillingPageContent";
import { getBillingStateForUser } from "@/lib/billing/server";
import { createClient } from "@/lib/supabase/server";

const AUTHOR_PLAN_CARDS: PlanCard[] = [
  {
    id: "pro",
    name: "Verkli Pro",
    description: "For AI-heavy workflows that require full capacity.",
    bullets: [
      "AI translation in the editor",
      "Audiobook generation",
      "Text-to-video and other Pro features",
    ],
  },
];

type Props = { searchParams: Promise<{ [key: string]: string | string[] | undefined }> };

export default async function AuthorBillingPage({ searchParams }: Props) {
  const params = await searchParams;
  const checkout = typeof params.checkout === "string" ? params.checkout : null;
  const sessionId = typeof params.session_id === "string" ? params.session_id : null;

  let initialBillingState = null;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user?.id) {
    const loaded = await getBillingStateForUser(user.id, "author");
    if (loaded.ok) initialBillingState = loaded.state;
  }

  return (
    <BillingPageClient
      planCards={AUTHOR_PLAN_CARDS}
      title="Subscription"
      subtitle="Manage Verkli Pro for authors."
      pastDueMessage="Your payment is overdue. Update your subscription to reactivate Pro features."
      initialCheckout={checkout}
      initialSessionId={sessionId}
      initialBillingState={initialBillingState}
    />
  );
}
