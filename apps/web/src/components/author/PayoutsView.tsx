import PayoutReportDownload from "./PayoutReportDownload";
import { formatPayoutAmount, type PayoutSnapshot } from "@/lib/payments/stripe-payouts";
import type { ConnectAccount } from "@/lib/payments/stripe-connect";

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
  return Object.prototype.hasOwnProperty.call(STATUS_BANNER_TONE, value);
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
      <h2 className="author-section-title text-lg font-medium tracking-tight">{t("setupTitle")}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{t("setupBody")}</p>

      <ul className="mt-4 space-y-1 text-sm text-muted-foreground">
        <li>• {t("schedule")}</li>
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
      <h2 className="author-section-title text-lg font-medium tracking-tight">{t("setupTitle")}</h2>
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

type PayoutStatusKey = `payoutStatus_${"paid" | "pending" | "in_transit" | "canceled" | "failed" | "unknown"}`;

function payoutStatusKey(status: string): PayoutStatusKey {
  switch (status) {
    case "paid": return "payoutStatus_paid";
    case "pending": return "payoutStatus_pending";
    case "in_transit": return "payoutStatus_in_transit";
    case "canceled": return "payoutStatus_canceled";
    case "failed": return "payoutStatus_failed";
    default: return "payoutStatus_unknown";
  }
}

function ActiveLedgerCard({
  account,
  snapshot,
  locale,
  t,
}: {
  account: ConnectAccount;
  snapshot: PayoutSnapshot;
  locale: string;
  t: PayoutsTranslations;
}) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="author-section-title text-lg font-medium tracking-tight">{t("title")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              <span className="font-mono text-xs">{account.stripe_account_id}</span>
              {" · "}
              {account.country}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge enabled={account.payouts_enabled} label={t("payoutsOk")} />
            <StatusBadge enabled={account.charges_enabled} label={t(account.charges_enabled ? "salesOk" : "salesPending")} />
          </div>
        </div>
      </div>

      {!snapshot.livemode ? <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">{t("testMode")}</p> : null}
      <p className="text-sm text-muted-foreground">{t("balanceScope")}</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <LedgerCell label={t("pending")} value={snapshot.pending.map((entry) => formatPayoutAmount(entry.amount, entry.currency, locale)).join(" · ") || t("noBalance")} />
        <LedgerCell label={t("available")} value={snapshot.available.map((entry) => formatPayoutAmount(entry.amount, entry.currency, locale)).join(" · ") || t("noBalance")} />
      </div>
      <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="author-section-title text-lg font-medium">{t("historyTitle")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("historyScope")}</p>
          </div>
          <PayoutReportDownload label={t("downloadReport")} preparing={t("reportPreparing")} failed={t("reportError")} signedOut={t("reportSignedOut")} started={t("reportStarted")} />
        </div>
        {snapshot.payouts.length === 0 ? (
          <p className="mt-6 text-sm text-muted-foreground">{t("historyEmpty")}</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b border-border text-muted-foreground">
                <th scope="col" className="py-3 pr-4">{t("created")}</th>
                <th scope="col" className="py-3 pr-4">{t("amount")}</th>
                <th scope="col" className="py-3 pr-4">{t("status")}</th>
                <th scope="col" className="py-3">{t("arrival")}</th>
              </tr></thead>
              <tbody>{snapshot.payouts.map((payout) => (
                <tr key={payout.id} className="border-b border-border last:border-0">
                  <td className="py-3 pr-4 whitespace-nowrap">{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(payout.created * 1000)}</td>
                  <td className="py-3 pr-4 whitespace-nowrap tabular-nums">{formatPayoutAmount(payout.amount, payout.currency, locale)}</td>
                  <td className="py-3 pr-4">{t(payoutStatusKey(payout.status))}</td>
                  <td className="py-3 whitespace-nowrap">{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(payout.arrival_date * 1000)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        {snapshot.hasMore ? <p className="mt-4 text-xs text-muted-foreground">{t("moreHistory")}</p> : null}
      </section>
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
    | "schedule"
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
    | "balanceScope"
    | "noBalance"
    | "historyTitle"
    | "historyScope"
    | "historyEmpty"
    | "downloadReport"
    | "reportPreparing"
    | "reportError"
    | "reportSignedOut"
    | "reportStarted"
    | "created"
    | "amount"
    | "status"
    | "arrival"
    | "moreHistory"
    | "testMode"
    | "loadError"
    | "retry"
    | PayoutStatusKey
    | StatusBannerKey
) => string;

export default function PayoutsView({ account, snapshot, loadFailed, locale, t, statusKey }: {
  account: ConnectAccount | null;
  snapshot: PayoutSnapshot | null;
  loadFailed: boolean;
  locale: string;
  t: PayoutsTranslations;
  statusKey?: string;
}) {
  const bannerInfo =
    statusKey && isStatusBannerKey(statusKey)
      ? { tone: STATUS_BANNER_TONE[statusKey], message: t(statusKey) }
      : null;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-10">
      <header className="space-y-1">
        <h1 className="author-page-title">{t("title")}</h1>
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

      {loadFailed ? (
        <div role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6">
          <p className="text-sm">{t("loadError")}</p>
          <a href="/author/billing/payouts" className="mt-4 inline-block rounded-lg border border-border px-4 py-2 text-sm font-medium">{t("retry")}</a>
        </div>
      ) : !account ? (
        <NotOnboardedCard t={t} />
      ) : !account.payouts_enabled ? (
        <OnboardingInProgressCard account={account} t={t} />
      ) : (
        snapshot ? <ActiveLedgerCard account={account} snapshot={snapshot} locale={locale} t={t} /> : null
      )}
    </div>
  );
}
