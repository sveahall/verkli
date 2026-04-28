"use client";

import { useEffect, useState } from "react";
import {
  deriveLoadState,
  evaluateKillCriteria,
  formatNumber,
  formatPercent,
  type CohortMetrics,
  type LoadState,
} from "./helpers";

/**
 * /admin/beta — soft-launch cohort dashboard.
 *
 * Single data source: GET /api/admin/metrics/funnel (PR 2). The page does no
 * direct DB reads. Admin gating is provided by /admin/layout.tsx →
 * requireAdminPageAccess(); a non-admin never reaches this component.
 */
export default function AdminBetaPage() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/metrics/funnel", {
          cache: "no-store",
        });
        let body: unknown = null;
        try {
          body = await res.json();
        } catch {
          // Non-JSON body — let deriveLoadState surface the http status.
        }
        if (cancelled) return;
        setState(
          deriveLoadState({ status: "fetched", httpStatus: res.status, body })
        );
      } catch {
        if (cancelled) return;
        setState(deriveLoadState({ status: "error" }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <h1 className="mb-2 text-2xl font-semibold text-slate-900 dark:text-white">
        Beta Cohort
      </h1>
      <p className="mb-6 text-sm text-slate-500 dark:text-white/50">
        Soft-launch funnel and kill-criteria thresholds.
      </p>

      <Body state={state} />
    </main>
  );
}

function Body({ state }: { state: LoadState }) {
  if (state.kind === "loading") {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 px-6 py-10 text-center text-sm text-slate-600 dark:border-white/20 dark:text-white/60">
        Loading funnel metrics…
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div
        role="alert"
        className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
      >
        <p className="font-semibold">Funnel unavailable</p>
        <p className="mt-1 text-red-700 dark:text-red-300/80">{state.message}</p>
      </div>
    );
  }

  const cohort = state.cohort;
  const kill = evaluateKillCriteria(cohort);

  return (
    <>
      {state.kind === "empty" && (
        <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-700 dark:border-white/10 dark:bg-white/[0.02] dark:text-white/70">
          No cohort activity yet. Metrics populate once the first waitlist
          signup, beta grant, publish, or read occurs.
        </div>
      )}

      {kill.warnings.length > 0 && (
        <div
          role="status"
          className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
        >
          <p className="font-semibold">Kill-criteria thresholds tripped</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {kill.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <CohortGrid cohort={cohort} />
    </>
  );
}

function CohortGrid({ cohort }: { cohort: CohortMetrics }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Metric label="Waitlist signups" value={formatNumber(cohort.waitlist_signups)} />
      <Metric label="Beta grants" value={formatNumber(cohort.beta_grants)} />
      <Metric
        label="First publish (distinct authors)"
        value={formatNumber(cohort.first_publish)}
      />
      <Metric
        label="First read (distinct readers)"
        value={formatNumber(cohort.first_read)}
      />
      <Metric
        label="7-day retention"
        value={formatPercent(cohort.retention_7d.rate)}
        sub={`${formatNumber(cohort.retention_7d.returning)} of ${formatNumber(cohort.retention_7d.eligible)} eligible`}
      />
    </div>
  );
}

function Metric({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.02]">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-white/50">
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold text-slate-900 dark:text-white">
        {value}
      </p>
      {sub && (
        <p className="mt-1 text-xs text-slate-500 dark:text-white/50">{sub}</p>
      )}
    </div>
  );
}
