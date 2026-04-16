"use client";

import dynamic from "next/dynamic";
import type { BillingState } from "@/lib/billing/state";
import type { PlanCard } from "@/components/billing/BillingPageContent";

const BillingPageContent = dynamic(
  () =>
    import("@/components/billing/BillingPageContent")
      .then((m) => ({ default: m.BillingPageContent }))
      .catch((err) => {
        console.error("[BillingPageClient] Failed to load billing component", err);
        return {
          default: function BillingLoadError() {
            return (
              <div className="mx-auto max-w-4xl px-6 py-12 text-center">
                <p className="text-muted-foreground">Could not load the page. Reload or try again later.</p>
              </div>
            );
          },
        };
      }),
  { ssr: false, loading: () => <BillingPageSkeleton /> }
);

function BillingPageSkeleton() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-12 animate-in fade-in duration-200">
      <div className="mb-8 h-8 w-48 rounded bg-muted" />
      <div className="mb-2 h-4 w-96 rounded bg-muted" />
      <div className="mb-6 h-24 rounded-lg border bg-card p-4">
        <div className="mb-2 h-4 w-32 rounded bg-muted" />
        <div className="h-4 w-24 rounded bg-muted" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="h-48 rounded-lg border bg-card" />
        <div className="h-48 rounded-lg border bg-card" />
      </div>
    </div>
  );
}

type BillingPageClientProps = {
  planCards: PlanCard[];
  title: string;
  subtitle: string;
  pastDueMessage: string;
  initialCheckout?: string | null;
  initialSessionId?: string | null;
  initialBillingState?: BillingState | null;
};

export function BillingPageClient(props: BillingPageClientProps) {
  return <BillingPageContent {...props} />;
}
