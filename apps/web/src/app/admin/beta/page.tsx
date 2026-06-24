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
import { PageHeader } from "@/components/ui/page-header";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/states";

type EventCount = { event_name: string; count: number };

/**
 * /admin/beta — soft-launch cohort dashboard.
 *
 * Single data source: GET /api/admin/metrics/funnel. The page does no direct
 * DB reads. Admin gating is provided by /admin/layout.tsx →
 * requireAdminPageAccess(); a non-admin never reaches this component.
 */
export default function AdminBetaPage() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [breakdown, setBreakdown] = useState<{
    author: EventCount[];
    reader: EventCount[];
  }>({ author: [], reader: [] });

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
        setBreakdown({
          author: extractEvents(body, "author"),
          reader: extractEvents(body, "reader"),
        });
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
    <div className="page-content py-10">
      <Breadcrumbs
        className="mb-4"
        items={[{ label: "Admin", href: "/admin" }, { label: "Beta" }]}
      />
      <PageHeader
        eyebrow="Soft launch"
        title="Beta Cohort"
        description="Soft-launch funnel and kill-criteria thresholds, over the last 7 days."
      />
      <div className="mt-8">
        <Body state={state} breakdown={breakdown} />
      </div>
    </div>
  );
}

function Body({
  state,
  breakdown,
}: {
  state: LoadState;
  breakdown: { author: EventCount[]; reader: EventCount[] };
}) {
  if (state.kind === "loading") {
    return <LoadingState title="Loading funnel metrics…" />;
  }

  if (state.kind === "error") {
    return (
      <ErrorState
        title="Funnel unavailable"
        description={state.message}
      />
    );
  }

  const cohort = state.cohort;
  const kill = evaluateKillCriteria(cohort);

  return (
    <div className="space-y-6">
      {state.kind === "empty" && (
        <EmptyState
          title="No cohort activity yet"
          description="Metrics populate once the first waitlist signup, beta grant, publish, or read occurs."
        />
      )}

      {kill.warnings.length > 0 && (
        <Card
          role="status"
          className="border-[var(--color-warning)]/40 bg-[var(--color-warning-muted)]"
        >
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="warning">Kill criteria</Badge>
              <span className="text-[15px] font-semibold text-slate-900 dark:text-white">
                Thresholds tripped
              </span>
            </div>
            <ul className="list-disc space-y-1 pl-5 text-[14px] text-slate-700 dark:text-white/70">
              {kill.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <CohortGrid cohort={cohort} />

      <div className="grid gap-4 lg:grid-cols-2">
        <EventBreakdown title="Author events" events={breakdown.author} />
        <EventBreakdown title="Reader events" events={breakdown.reader} />
      </div>
    </div>
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
    <Card className="px-5 py-5">
      <p className="text-eyebrow">{label}</p>
      <p className="text-stat mt-2 tabular-nums text-slate-900 dark:text-white">
        {value}
      </p>
      {sub && (
        <p className="mt-1 text-[13px] text-slate-500 dark:text-white/50">{sub}</p>
      )}
    </Card>
  );
}

function EventBreakdown({
  title,
  events,
}: {
  title: string;
  events: EventCount[];
}) {
  return (
    <Card className="p-0">
      <CardHeader>
        <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white">
          {title}
        </h3>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-[13px] text-slate-500 dark:text-white/50">
            No events in window.
          </p>
        ) : (
          <ul className="space-y-2">
            {events.slice(0, 8).map((e) => (
              <li
                key={e.event_name}
                className="flex items-center justify-between gap-3 text-[14px]"
              >
                <span className="truncate font-mono text-[13px] text-slate-700 dark:text-white/70">
                  {e.event_name}
                </span>
                <span className="tabular-nums font-medium text-slate-900 dark:text-white">
                  {formatNumber(e.count)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function extractEvents(body: unknown, key: "author" | "reader"): EventCount[] {
  if (typeof body !== "object" || body === null) return [];
  const arr = (body as Record<string, unknown>)[key];
  if (!Array.isArray(arr)) return [];
  return arr.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const name = (item as Record<string, unknown>).event_name;
    const count = (item as Record<string, unknown>).count;
    if (typeof name !== "string" || typeof count !== "number") return [];
    return [{ event_name: name, count }];
  });
}
