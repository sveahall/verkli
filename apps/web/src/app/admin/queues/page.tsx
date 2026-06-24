// Admin queue dashboard (Sprint 0.5 Task 6).
//
// Shows job counts (waiting, active, delayed, completed, failed, paused) for
// every BullMQ queue. The route inherits admin auth from
// app/admin/layout.tsx (requireAdminPageAccess). Queue-reading logic lives in
// lib/queues/admin-queue-stats.ts (shared with the dashboard backlog).

import { loadQueueRows } from "@/lib/queues/admin-queue-stats";
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

export default async function AdminQueuesPage() {
  const rows = await loadQueueRows();
  const failures = rows.filter((r) => r.lastFailedReason);

  return (
    <div className="page-content py-10">
      <Breadcrumbs
        className="mb-4"
        items={[{ label: "Admin", href: "/admin" }, { label: "Queues" }]}
      />
      <PageHeader
        eyebrow="Operations"
        title="Queues"
        description="BullMQ job counts for all production queues. Service-role connected. Refresh the page to re-read."
      />

      <Card className="mt-8 overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Queue</TableHead>
              <TableHead>Jobs</TableHead>
              <TableHead className="text-right">Waiting</TableHead>
              <TableHead className="text-right">Active</TableHead>
              <TableHead className="text-right">Delayed</TableHead>
              <TableHead className="text-right">Completed</TableHead>
              <TableHead className="text-right">Failed</TableHead>
              <TableHead className="text-right">Paused</TableHead>
              <TableHead className="text-right">Attempts</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.name}>
                <TableCell className="font-mono text-[13px] text-slate-900 dark:text-white">
                  {row.name}
                </TableCell>
                <TableCell className="text-slate-500 dark:text-white/50">
                  {row.jobNames.length > 0 ? row.jobNames.join(", ") : "—"}
                </TableCell>
                {row.counts ? (
                  <>
                    <TableCell className="text-right tabular-nums">
                      {row.counts.waiting > 0 ? (
                        <Badge variant="info">{row.counts.waiting}</Badge>
                      ) : (
                        row.counts.waiting
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.counts.active > 0 ? (
                        <Badge variant="brand">{row.counts.active}</Badge>
                      ) : (
                        row.counts.active
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.counts.delayed}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.counts.completed}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.counts.failed > 0 ? (
                        <Badge variant="error">{row.counts.failed}</Badge>
                      ) : (
                        row.counts.failed
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.counts.paused}
                    </TableCell>
                  </>
                ) : (
                  <TableCell
                    colSpan={6}
                    className="text-right text-[13px] text-[var(--color-warning)]"
                  >
                    {row.error ?? "no data"}
                  </TableCell>
                )}
                <TableCell className="text-right tabular-nums">
                  {row.attempts}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Card className="mt-6 p-0">
        <details className="px-6 py-4 text-[14px]">
          <summary className="cursor-pointer font-medium text-slate-700 dark:text-white/80">
            Last-failure reasons{failures.length > 0 ? ` (${failures.length})` : ""}
          </summary>
          <ul className="mt-3 space-y-2">
            {failures.map((r) => (
              <li key={r.name} className="font-mono text-[12px] text-slate-600 dark:text-white/60">
                <span className="font-semibold text-slate-900 dark:text-white">{r.name}</span>:{" "}
                {r.lastFailedReason}
              </li>
            ))}
            {failures.length === 0 ? (
              <li className="text-[12px] text-slate-500 dark:text-white/50">
                No recent failures recorded.
              </li>
            ) : null}
          </ul>
        </details>
      </Card>
    </div>
  );
}
