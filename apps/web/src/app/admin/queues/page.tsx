// Admin queue dashboard (Sprint 0.5 Task 6).
//
// Shows job counts (waiting, active, delayed, completed, failed, paused) for
// every BullMQ queue defined in lib/queues/descriptors.ts. The route inherits
// admin auth from app/admin/layout.tsx (requireAdminPageAccess).
//
// We do not mount Bull Board's UI directly because there is no first-party
// adapter for the Next.js App Router — see docs/sprint-0.5-deferred.md
// §"Bull Board UI". This dashboard provides the operationally-critical view
// (counts + last-failure inspection) without that integration overhead.

import { Queue } from "bullmq";
import {
  AUDIOBOOK_QUEUE_DESCRIPTOR,
  IMPORT_QUEUE_DESCRIPTOR,
  MARKETING_QUEUE_DESCRIPTOR,
  RECOMMENDATIONS_QUEUE_DESCRIPTOR,
  SOCIAL_PUBLISH_QUEUE_DESCRIPTOR,
  TRANSLATION_QUEUE_DESCRIPTOR,
} from "@/lib/queues/descriptors";
import { QUEUE_NAMES } from "@/lib/queue-names";
import { getRedisConnectionOptions } from "@/lib/env";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ALL_DESCRIPTORS = [
  IMPORT_QUEUE_DESCRIPTOR,
  TRANSLATION_QUEUE_DESCRIPTOR,
  AUDIOBOOK_QUEUE_DESCRIPTOR,
  SOCIAL_PUBLISH_QUEUE_DESCRIPTOR,
  RECOMMENDATIONS_QUEUE_DESCRIPTOR,
  MARKETING_QUEUE_DESCRIPTOR,
];

type QueueRow = {
  name: string;
  jobNames: readonly string[];
  attempts: number;
  counts: {
    waiting: number;
    active: number;
    delayed: number;
    completed: number;
    failed: number;
    paused: number;
  } | null;
  lastFailedReason: string | null;
  error: string | null;
};

async function loadQueueRows(): Promise<QueueRow[]> {
  const connection = getRedisConnectionOptions();
  if (!connection) {
    return ALL_DESCRIPTORS.map((d) => ({
      name: d.queueName,
      jobNames: d.jobNames,
      attempts: d.retryPolicy.attempts,
      counts: null,
      lastFailedReason: null,
      error: "REDIS_URL not configured",
    }));
  }

  // Include `notifications` even though it has no descriptor (it's used by
  // the notifications worker). Reading queue stats does not require a
  // descriptor.
  const queueNames = [
    ...new Set([
      ...ALL_DESCRIPTORS.map((d) => d.queueName),
      QUEUE_NAMES.NOTIFICATIONS,
    ]),
  ];

  const rows = await Promise.all(
    queueNames.map(async (queueName): Promise<QueueRow> => {
      const descriptor = ALL_DESCRIPTORS.find((d) => d.queueName === queueName);
      const queue = new Queue(queueName, { connection: { ...connection } });
      try {
        const [counts, failed] = await Promise.all([
          queue.getJobCounts(
            "waiting",
            "active",
            "delayed",
            "completed",
            "failed",
            "paused"
          ),
          queue.getFailed(0, 0),
        ]);
        return {
          name: queueName,
          jobNames: descriptor?.jobNames ?? ([] as readonly string[]),
          attempts: descriptor?.retryPolicy.attempts ?? 0,
          counts: {
            waiting: Number(counts.waiting ?? 0),
            active: Number(counts.active ?? 0),
            delayed: Number(counts.delayed ?? 0),
            completed: Number(counts.completed ?? 0),
            failed: Number(counts.failed ?? 0),
            paused: Number(counts.paused ?? 0),
          },
          lastFailedReason: failed[0]?.failedReason ?? null,
          error: null,
        };
      } catch (err) {
        return {
          name: queueName,
          jobNames: descriptor?.jobNames ?? ([] as readonly string[]),
          attempts: descriptor?.retryPolicy.attempts ?? 0,
          counts: null,
          lastFailedReason: null,
          error: err instanceof Error ? err.message : String(err),
        };
      } finally {
        await queue.close().catch(() => {});
      }
    })
  );

  return rows;
}

export default async function AdminQueuesPage() {
  const rows = await loadQueueRows();

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-10">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Queues</h1>
        <p className="text-sm text-muted-foreground">
          BullMQ job counts for all production queues. Service-role connected.
          Refresh the page to re-read.
        </p>
      </header>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-muted/40 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left">Queue</th>
              <th className="px-4 py-2 text-left">Jobs</th>
              <th className="px-4 py-2 text-right">Waiting</th>
              <th className="px-4 py-2 text-right">Active</th>
              <th className="px-4 py-2 text-right">Delayed</th>
              <th className="px-4 py-2 text-right">Completed</th>
              <th className="px-4 py-2 text-right">Failed</th>
              <th className="px-4 py-2 text-right">Paused</th>
              <th className="px-4 py-2 text-right">Attempts</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.name} className="hover:bg-muted/30">
                <td className="px-4 py-2 font-mono">{row.name}</td>
                <td className="px-4 py-2">
                  {row.jobNames.length > 0 ? row.jobNames.join(", ") : "—"}
                </td>
                {row.counts ? (
                  <>
                    <td className="px-4 py-2 text-right tabular-nums">{row.counts.waiting}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{row.counts.active}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{row.counts.delayed}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{row.counts.completed}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{row.counts.failed}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{row.counts.paused}</td>
                  </>
                ) : (
                  <td colSpan={6} className="px-4 py-2 text-right text-amber-700 dark:text-amber-300">
                    {row.error ?? "no data"}
                  </td>
                )}
                <td className="px-4 py-2 text-right tabular-nums">{row.attempts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <details className="rounded-lg border border-border p-4 text-sm">
        <summary className="cursor-pointer font-medium">Last-failure reasons</summary>
        <ul className="mt-3 space-y-2">
          {rows
            .filter((r) => r.lastFailedReason)
            .map((r) => (
              <li key={r.name} className="font-mono text-xs">
                <span className="font-semibold">{r.name}</span>: {r.lastFailedReason}
              </li>
            ))}
          {rows.every((r) => !r.lastFailedReason) ? (
            <li className="text-xs text-muted-foreground">No recent failures recorded.</li>
          ) : null}
        </ul>
      </details>
    </div>
  );
}
