/**
 * Collapses raw events into one row per user, day, pipeline, provider and unit.
 *
 * Units are never merged. A thousand input tokens and a thousand characters are
 * not two thousand of anything, and a rolled-up row that mixed them could not
 * be repriced — which is the one thing the raw units exist to make possible.
 */
export type RollupInput = {
  user_id: string;
  occurred_at: string;
  pipeline: string | null;
  provider: string | null;
  unit: string;
  quantity: number;
  cost_usd: number | null;
};

export type RollupRow = {
  user_id: string;
  day: string;
  pipeline: string;
  provider: string;
  unit: string;
  quantity_sum: number;
  cost_usd_sum: number;
  event_count: number;
};

export function rollupRows(rows: RollupInput[]): RollupRow[] {
  const out = new Map<string, RollupRow>();

  for (const row of rows) {
    const day = row.occurred_at.slice(0, 10);
    // usage_daily's key columns are NOT NULL and default to ''. Collapsing null
    // the same way here keeps the upsert from splitting one logical row in two.
    const pipeline = row.pipeline ?? "";
    const provider = row.provider ?? "";
    const key = [row.user_id, day, pipeline, provider, row.unit].join("\u0000");

    const entry =
      out.get(key) ??
      {
        user_id: row.user_id,
        day,
        pipeline,
        provider,
        unit: row.unit,
        quantity_sum: 0,
        cost_usd_sum: 0,
        event_count: 0,
      };

    entry.quantity_sum += row.quantity;
    if (typeof row.cost_usd === "number") entry.cost_usd_sum += row.cost_usd;
    entry.event_count += 1;
    out.set(key, entry);
  }

  return [...out.values()];
}
