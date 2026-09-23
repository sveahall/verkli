import { notFound } from "next/navigation";
import { createTranslator } from "next-intl";
import enMessages from "../../../../messages/en.json";
import svMessages from "../../../../messages/sv.json";
import PayoutsView from "@/components/author/PayoutsView";
import { payoutReportCsv, type PayoutSnapshot } from "@/lib/payments/stripe-payouts";
import type { ConnectAccount } from "@/lib/payments/stripe-connect";
import FinanceExportPreview from "./FinanceExportPreview";

export default async function Page({ searchParams }: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();
  const params = await searchParams;
  const state = typeof params?.state === "string" ? params.state : "history";
  const locale = params?.locale === "sv" ? "sv" : "en";
  const t = createTranslator({ locale, messages: locale === "sv" ? svMessages : enMessages, namespace: "author.billing.payouts" });
  const account: ConnectAccount = {
    user_id: "synthetic-author", stripe_account_id: "acct_preview_only", country: "SE",
    payouts_enabled: state !== "onboarding", charges_enabled: true, details_submitted: true,
    capabilities: null, requirements: null, payout_schedule: "monthly", default_currency: "sek",
    created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z",
  };
  const snapshot: PayoutSnapshot = {
    available: state === "empty" ? [] : [{ amount: state === "zero" ? 0 : 124500, currency: "sek" }, { amount: state === "zero" ? 0 : 4599, currency: "eur" }],
    pending: state === "empty" ? [] : [{ amount: state === "zero" ? 0 : 35200, currency: "sek" }],
    payouts: state === "history" || state === "test-mode" ? [
      { id: "po_preview_paid", amount: 320000, currency: "sek", status: "paid", created: 1788307200, arrival_date: 1788480000 },
      { id: "po_preview_pending", amount: 25000, currency: "eur", status: "pending", created: 1788393600, arrival_date: 1788739200 },
      { id: "po_preview_failed", amount: 10000, currency: "sek", status: "failed", created: 1788480000, arrival_date: 1788825600 },
    ] : [],
    hasMore: state === "history", livemode: state !== "test-mode",
  };
  return <FinanceExportPreview state={state} locale={locale} csv={payoutReportCsv(snapshot)}>
    <PayoutsView account={state === "not-connected" ? null : account} snapshot={snapshot}
      loadFailed={state === "failure"} locale={locale} t={t} />
  </FinanceExportPreview>;
}
