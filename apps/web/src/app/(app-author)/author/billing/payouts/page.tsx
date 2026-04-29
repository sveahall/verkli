// Author payouts ledger v0 — Week 1 of pre-raise plan.
//
// Three states:
//   1. Not onboarded: "Set up payouts" CTA → POSTs to /api/billing/connect/onboard.
//   2. Mid-onboarding (account row exists but payouts_enabled=false):
//      "Continue setup" button → /api/billing/connect/refresh.
//   3. Active: status block + payout schedule selector + ledger placeholder.
//
// Real ledger numbers (pending/available/paid_out) land in Week 3 alongside
// PRO SKUs. v0 shows the structure so authors see where the data will appear.

import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getPayoutAccount,
  type ConnectAccount,
} from "@/lib/payments/stripe-connect";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = Record<string, string | string[] | undefined>;

type StatusBannerKey =
  | "payouts_enabled"
  | "kyc_submitted"
  | "kyc_incomplete"
  | "needs_onboarding"
  | "onboarding_failed";

const STATUS_BANNER_TONE: Record<StatusBannerKey, "neutral" | "ok" | "warn"> = {
  payouts_enabled: "ok",
  kyc_submitted: "neutral",
  kyc_incomplete: "warn",
  needs_onboarding: "warn",
  onboarding_failed: "warn",
};

function isStatusBannerKey(value: string): value is StatusBannerKey {
  return value in STATUS_BANNER_TONE;
}

function StatusBadge({ enabled, label }: { enabled: boolean; label: string }) {
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium " +
        (enabled
          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : "bg-amber-500/10 text-amber-800 dark:text-amber-200")
      }
    >
      <span
        className={
          "h-1.5 w-1.5 rounded-full " +
          (enabled ? "bg-emerald-500" : "bg-amber-500")
        }
      />
      {label}
    </span>
  );
}

function NotOnboardedCard({ t }: { t: PayoutsTranslations }) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <h2 className="text-lg font-semibold tracking-tight">{t("setupTitle")}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{t("setupBody")}</p>

      <ul className="mt-4 space-y-1 text-sm text-muted-foreground">
        <li>• {t("platformFee")}</li>
        <li>• {t("schedule")}</li>
        <li>• {t("taxForms")}</li>
      </ul>

      <form action="/api/billing/connect/onboard" method="POST" className="mt-6">
        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:opacity-90"
        >
          {t("startOnboarding")}
        </button>
      </form>
    </div>
  );
}

function OnboardingInProgressCard({
  account,
  t,
}: {
  account: ConnectAccount;
  t: PayoutsTranslations;
}) {
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6">
      <h2 className="text-lg font-semibold tracking-tight">{t("setupTitle")}</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {t("setupBody")} ({account.stripe_account_id})
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <StatusBadge
          enabled={account.details_submitted}
          label={account.details_submitted ? t("kycSubmitted") : t("kycRequired")}
        />
        <StatusBadge
          enabled={account.payouts_enabled}
          label={account.payouts_enabled ? t("payoutsOk") : t("payoutsPending")}
        />
        <StatusBadge
          enabled={account.charges_enabled}
          label={account.charges_enabled ? t("salesOk") : t("salesPending")}
        />
      </div>

      <a
        href="/api/billing/connect/refresh"
        className="mt-6 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:opacity-90"
      >
        {t("continueOnboarding")}
      </a>
    </div>
  );
}

function ActiveLedgerCard({
  account,
  t,
}: {
  account: ConnectAccount;
  t: PayoutsTranslations;
}) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">{t("title")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              <span className="font-mono text-xs">{account.stripe_account_id}</span>
              {" · "}
              {account.country}
              {" · "}
              {account.payout_schedule}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge enabled={account.payouts_enabled} label={t("payoutsOk")} />
            <StatusBadge enabled={account.charges_enabled} label={t("salesOk")} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <LedgerCell label={t("pending")} value="—" />
        <LedgerCell label={t("available")} value="—" />
        <LedgerCell label={t("paidOut")} value="—" />
      </div>

      <p className="text-xs text-muted-foreground">{t("balanceComingSoon")}</p>
    </div>
  );
}

function LedgerCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

type PayoutsTranslations = (
  key:
    | "title"
    | "subtitle"
    | "setupTitle"
    | "setupBody"
    | "platformFee"
    | "schedule"
    | "taxForms"
    | "startOnboarding"
    | "continueOnboarding"
    | "kycRequired"
    | "kycSubmitted"
    | "payoutsOk"
    | "payoutsPending"
    | "salesOk"
    | "salesPending"
    | "pending"
    | "available"
    | "paidOut"
    | "balanceComingSoon"
    | StatusBannerKey
) => string;

export default async function AuthorPayoutsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/author/signin");

  const admin = createAdminClient();
  const account = await getPayoutAccount(admin, user.id);

  const resolvedParams = (await (searchParams ?? Promise.resolve({} as SearchParams))) as SearchParams;
  const statusParam = resolvedParams?.status;
  const statusKey = Array.isArray(statusParam) ? statusParam[0] : statusParam;
  const t = (await getTranslations("author.billing.payouts")) as PayoutsTranslations;

  const bannerInfo =
    statusKey && isStatusBannerKey(statusKey)
      ? { tone: STATUS_BANNER_TONE[statusKey], message: t(statusKey) }
      : null;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-10">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>

      {bannerInfo ? (
        <div
          className={
            "rounded-lg border p-3 text-sm " +
            (bannerInfo.tone === "ok"
              ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-900 dark:text-emerald-200"
              : bannerInfo.tone === "warn"
                ? "border-amber-500/30 bg-amber-500/5 text-amber-900 dark:text-amber-200"
                : "border-border bg-card text-foreground")
          }
        >
          {bannerInfo.message}
        </div>
      ) : null}

      {!account ? (
        <NotOnboardedCard t={t} />
      ) : !account.payouts_enabled ? (
        <OnboardingInProgressCard account={account} t={t} />
      ) : (
        <ActiveLedgerCard account={account} t={t} />
      )}
    </div>
  );
}
