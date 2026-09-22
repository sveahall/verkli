import type { PriceRow, UsageUnit } from "./types";

/**
 * The applicable price row for one measurement, or null.
 *
 * Null is a normal outcome, not an error: a model can be called before anyone
 * has entered its price, and during the beta that is the expected state for
 * every model whose list price we have not yet confirmed with the vendor. The
 * event is still written with its raw quantity and flagged unpriced, so the gap
 * shows up in admin as "unpriced" rather than as zero spend.
 */
export function priceFor(
  rows: PriceRow[],
  provider: string,
  model: string,
  unit: UsageUnit,
  at: Date
): PriceRow | null {
  const ms = at.getTime();
  const applicable = rows.filter(
    (r) =>
      r.provider === provider &&
      r.model === model &&
      r.unit === unit &&
      new Date(r.effective_from).getTime() <= ms &&
      (r.effective_to === null || new Date(r.effective_to).getTime() > ms)
  );
  if (applicable.length === 0) return null;
  // Newest start wins, so a mid-period price change takes effect without anyone
  // having to close the previous row first. An event dated before that change
  // still resolves to the older row, which is what makes historical repricing
  // truthful rather than retroactive.
  return applicable.reduce((best, r) =>
    new Date(r.effective_from).getTime() > new Date(best.effective_from).getTime() ? r : best
  );
}

export function computeCost(
  row: PriceRow | null,
  quantity: number
): { costUsd: number | null; priceVersion: string | null } {
  if (!row) return { costUsd: null, priceVersion: null };
  return { costUsd: row.usd_per_unit * quantity, priceVersion: row.version };
}
