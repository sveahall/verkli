/**
 * Aggregations behind /admin/usage.
 *
 * Pure on purpose: the reading of these numbers decides subscription and credit
 * pricing, so the arithmetic is testable without a database.
 *
 * Reads `usage_events` directly rather than `usage_daily`. At beta volume that
 * is both instant and always current; the rolled-up table exists for retention.
 * Swap the source here when row counts make it worth the staleness.
 */
export type UsageRow = {
  user_id: string;
  occurred_at: string;
  kind: string;
  provider: string | null;
  model: string | null;
  pipeline: string | null;
  quantity: number;
  unit: string;
  cost_usd: number | null;
  meta: Record<string, unknown> | null;
};

export type UserSummary = {
  userId: string;
  costUsd: number;
  /** Events whose provider has no price yet. A low cost beside a high count means unmeasured, not cheap. */
  unpricedEvents: number;
  storageBytes: number;
  egressBytes: number;
  jobCount: number;
  jobMs: number;
};

export function summarizeByUser(rows: UsageRow[]): UserSummary[] {
  const byUser = new Map<string, UserSummary>();
  // Storage is a reading, not an increment: keep the newest per user+bucket.
  const latestStorage = new Map<string, { at: number; bytes: number }>();

  const get = (userId: string): UserSummary => {
    let u = byUser.get(userId);
    if (!u) {
      u = { userId, costUsd: 0, unpricedEvents: 0, storageBytes: 0, egressBytes: 0, jobCount: 0, jobMs: 0 };
      byUser.set(userId, u);
    }
    return u;
  };

  for (const row of rows) {
    const u = get(row.user_id);
    if (typeof row.cost_usd === "number") u.costUsd += row.cost_usd;
    if (row.meta?.price_missing === true) u.unpricedEvents += 1;

    if (row.kind === "storage_snapshot") {
      const bucket = String(row.meta?.bucket ?? "");
      const key = `${row.user_id}\u0000${bucket}`;
      const at = new Date(row.occurred_at).getTime();
      const seen = latestStorage.get(key);
      if (!seen || at >= seen.at) latestStorage.set(key, { at, bytes: row.quantity });
    } else if (row.kind === "egress_grant") {
      u.egressBytes += row.quantity;
    } else if (row.kind === "job") {
      u.jobCount += 1;
      u.jobMs += row.quantity;
    }
  }

  for (const [key, { bytes }] of latestStorage) {
    const userId = key.split("\u0000")[0];
    get(userId).storageBytes += bytes;
  }

  return [...byUser.values()].sort((a, b) => b.costUsd - a.costUsd);
}

export type PipelineSummary = { pipeline: string; costUsd: number; events: number };

export function summarizeByPipeline(rows: UsageRow[]): PipelineSummary[] {
  const out = new Map<string, PipelineSummary>();
  for (const row of rows) {
    const pipeline = row.pipeline ?? "(none)";
    const entry = out.get(pipeline) ?? { pipeline, costUsd: 0, events: 0 };
    if (typeof row.cost_usd === "number") entry.costUsd += row.cost_usd;
    entry.events += 1;
    out.set(pipeline, entry);
  }
  return [...out.values()].sort((a, b) => b.costUsd - a.costUsd);
}

export type DaySummary = { day: string; costUsd: number; events: number };

export function summarizeByDay(rows: UsageRow[]): DaySummary[] {
  const out = new Map<string, DaySummary>();
  for (const row of rows) {
    const day = row.occurred_at.slice(0, 10);
    const entry = out.get(day) ?? { day, costUsd: 0, events: 0 };
    if (typeof row.cost_usd === "number") entry.costUsd += row.cost_usd;
    entry.events += 1;
    out.set(day, entry);
  }
  return [...out.values()].sort((a, b) => a.day.localeCompare(b.day));
}
