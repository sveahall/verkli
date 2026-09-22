// Per-user cost for the beta.
//
// Exists to answer one question with data instead of a guess: what should a
// subscription and a credit top-up cost? It measures and never enforces —
// nothing here throttles, bills or blocks anyone.
//
// Admin auth is inherited from app/admin/layout.tsx (requireAdminPageAccess).

import { createAdminClient } from "@/lib/supabase/admin";
import { summarizeByUser, summarizeByPipeline, summarizeByDay, type UsageRow } from "@/lib/usage/report";
import { PageHeader } from "@/components/ui/page-header";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const WINDOW_DAYS = 30;

function usd(value: number): string {
  if (value === 0) return "$0.00";
  if (value < 0.01) return `<$0.01`;
  return `$${value.toFixed(2)}`;
}

function mb(bytes: number): string {
  if (bytes === 0) return "—";
  if (bytes < 1e6) return `${(bytes / 1e3).toFixed(0)} kB`;
  if (bytes < 1e9) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${(bytes / 1e9).toFixed(2)} GB`;
}

function minutes(ms: number): string {
  if (ms === 0) return "—";
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

/**
 * Kept out of the component body deliberately. `Date.now()` is impure, and the
 * React Compiler rules forbid calling it during render even in an async server
 * component where the impurity is the whole point — this page is
 * `force-dynamic` precisely so every request re-reads the window.
 */
async function loadUsage(days: number) {
  const admin = createAdminClient();
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const [{ data: events, error }, { data: profiles }] = await Promise.all([
    admin
      .from("usage_events")
      .select("user_id, occurred_at, kind, provider, model, pipeline, quantity, unit, cost_usd, meta")
      .gte("occurred_at", since)
      .order("occurred_at", { ascending: false })
      .limit(50_000),
    admin.from("profiles").select("user_id, display_name"),
  ]);

  return {
    rows: (events ?? []) as UsageRow[],
    nameOf: new Map((profiles ?? []).map((p) => [p.user_id, p.display_name])),
    error,
  };
}

export default async function AdminUsagePage() {
  const { rows, nameOf, error } = await loadUsage(WINDOW_DAYS);

  const byUser = summarizeByUser(rows);
  const byPipeline = summarizeByPipeline(rows);
  const byDay = summarizeByDay(rows);
  const totalCost = byPipeline.reduce((n, p) => n + p.costUsd, 0);
  const unpriced = byUser.reduce((n, u) => n + u.unpricedEvents, 0);

  return (
    <div className="page-content py-10">
      <Breadcrumbs
        className="mb-4"
        items={[{ label: "Admin", href: "/admin" }, { label: "Usage" }]}
      />
      <PageHeader
        eyebrow="Operations"
        title="Usage & cost"
        description={`What each user has cost over the last ${WINDOW_DAYS} days. Measurement only — nothing here limits anyone. Raw units are stored alongside cost, so history can be repriced when a vendor changes its list.`}
      />

      {error ? (
        <Card className="mt-8 p-6">
          <p className="text-sm text-muted-foreground">
            Could not read usage events: {error.message}
          </p>
        </Card>
      ) : null}

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">Measured spend</p>
          <p className="mt-1 font-display text-2xl tabular-nums">{usd(totalCost)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">Events recorded</p>
          <p className="mt-1 font-display text-2xl tabular-nums">{rows.length.toLocaleString("en")}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">Awaiting a price</p>
          <p className="mt-1 font-display text-2xl tabular-nums">{unpriced.toLocaleString("en")}</p>
          {unpriced > 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Quantities are recorded; add the vendor rate to usage_price_book to value them.
            </p>
          ) : null}
        </Card>
      </div>

      <div className="mt-8 flex items-center justify-between gap-4">
        <h2 className="text-section-title">Per user</h2>
        <a className="btn-secondary" href="/api/admin/usage/export" download>
          Export CSV
        </a>
      </div>

      <Card className="mt-3 overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead className="text-right">AI cost</TableHead>
              <TableHead className="text-right">Unpriced</TableHead>
              <TableHead className="text-right">Storage</TableHead>
              <TableHead className="text-right">Egress (est.)</TableHead>
              <TableHead className="text-right">Jobs</TableHead>
              <TableHead className="text-right">Job time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {byUser.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                  No usage recorded yet in this window.
                </TableCell>
              </TableRow>
            ) : (
              byUser.map((u) => (
                <TableRow key={u.userId}>
                  <TableCell>
                    <span className="block">{nameOf.get(u.userId) ?? "—"}</span>
                    <span className="block text-xs text-muted-foreground">{u.userId.slice(0, 8)}</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{usd(u.costUsd)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {u.unpricedEvents > 0 ? (
                      <Badge variant="warning">{u.unpricedEvents}</Badge>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{mb(u.storageBytes)}</TableCell>
                  <TableCell className="text-right tabular-nums">{mb(u.egressBytes)}</TableCell>
                  <TableCell className="text-right tabular-nums">{u.jobCount || "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{minutes(u.jobMs)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <p className="mt-2 text-xs text-muted-foreground">
        Egress is an estimate. Files are served by a redirect straight from storage, so the bytes never
        cross our server: this counts what was handed out, not what was fetched. Use it to split the real
        bill between users, never as the bill.
      </p>

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="text-section-title">Per pipeline</h2>
          <Card className="mt-3 overflow-hidden p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pipeline</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Events</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byPipeline.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">
                      Nothing recorded yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  byPipeline.map((p) => (
                    <TableRow key={p.pipeline}>
                      <TableCell>{p.pipeline}</TableCell>
                      <TableCell className="text-right tabular-nums">{usd(p.costUsd)}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.events.toLocaleString("en")}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </section>

        <section>
          <h2 className="text-section-title">Per day</h2>
          <Card className="mt-3 overflow-hidden p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Day</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Events</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byDay.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">
                      Nothing recorded yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  byDay.map((d) => (
                    <TableRow key={d.day}>
                      <TableCell className="tabular-nums">{d.day}</TableCell>
                      <TableCell className="text-right tabular-nums">{usd(d.costUsd)}</TableCell>
                      <TableCell className="text-right tabular-nums">{d.events.toLocaleString("en")}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </section>
      </div>
    </div>
  );
}
