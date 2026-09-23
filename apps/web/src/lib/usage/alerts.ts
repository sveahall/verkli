/**
 * Cost anomaly detection for the beta.
 *
 * Without this, a user who burns a month's margin overnight is invisible until
 * somebody happens to open /admin/usage. During a beta with no pricing, that is
 * the one failure mode that actually costs money.
 *
 * Detection only — nothing here throttles or blocks anyone.
 */
export type DailySpend = { userId: string; day: string; costUsd: number };

export type CostAlert =
  | { kind: "user"; day: string; userId: string; costUsd: number; limitUsd: number }
  | { kind: "platform"; day: string; costUsd: number; limitUsd: number };

export type CostLimits = { platformDailyUsd: number; userDailyUsd: number };

export const DEFAULT_COST_LIMITS: CostLimits = {
  platformDailyUsd: Number(process.env.USAGE_ALERT_DAILY_USD ?? 50),
  userDailyUsd: Number(process.env.USAGE_ALERT_USER_DAILY_USD ?? 10),
};

export function findCostAlerts(rows: DailySpend[], limits: CostLimits): CostAlert[] {
  const byUserDay = new Map<string, { day: string; userId: string; costUsd: number }>();
  const byDay = new Map<string, number>();

  for (const row of rows) {
    const key = `${row.day}\u0000${row.userId}`;
    const entry = byUserDay.get(key) ?? { day: row.day, userId: row.userId, costUsd: 0 };
    entry.costUsd += row.costUsd;
    byUserDay.set(key, entry);
    byDay.set(row.day, (byDay.get(row.day) ?? 0) + row.costUsd);
  }

  const alerts: CostAlert[] = [];

  for (const entry of byUserDay.values()) {
    // `> 0` guards the day-one case: every cost is null until the price book is
    // filled, so a threshold that fires on zero would cry wolf immediately and
    // be muted long before it had anything true to say.
    if (entry.costUsd > 0 && entry.costUsd > limits.userDailyUsd) {
      alerts.push({ kind: "user", ...entry, limitUsd: limits.userDailyUsd });
    }
  }

  for (const [day, costUsd] of byDay) {
    if (costUsd > 0 && costUsd > limits.platformDailyUsd) {
      alerts.push({ kind: "platform", day, costUsd, limitUsd: limits.platformDailyUsd });
    }
  }

  return alerts.sort((a, b) => b.costUsd - a.costUsd);
}

export function describeAlert(alert: CostAlert): string {
  const cost = `$${alert.costUsd.toFixed(2)}`;
  const limit = `$${alert.limitUsd.toFixed(2)}`;
  return alert.kind === "user"
    ? `user ${alert.userId} spent ${cost} on ${alert.day}, over the ${limit} daily ceiling`
    : `platform spent ${cost} on ${alert.day}, over the ${limit} daily ceiling`;
}
