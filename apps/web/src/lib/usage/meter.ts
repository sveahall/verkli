import { createAdminClient } from "@/lib/supabase/admin";
import { priceFor, computeCost } from "./price-book";
import type { MeterContext, PriceRow, UsageEventInput } from "./types";

/**
 * Writes usage rows. Measures cost; never enforces it.
 *
 * Fire-and-forget by contract: this resolves even when the database is gone.
 * By the time we are asked to record a call the money is already spent, so
 * throwing here would lose the author's work *and* the record of what it cost.
 * A broken meter must degrade to missing data, never to a failed audiobook.
 *
 * Callers therefore do not need to guard the call, and must not treat a
 * resolved promise as proof that a row was written.
 */
export async function recordUsage(
  ctx: MeterContext | undefined,
  events: UsageEventInput[]
): Promise<void> {
  if (!ctx) return;
  // A zero is not a measurement. Providers return empty usage blocks on
  // cached or refused replies, and writing those would put thousands of
  // meaningless rows between us and the numbers that matter.
  const billable = events.filter((e) => e.quantity > 0);
  if (billable.length === 0) return;

  try {
    const admin = createAdminClient();
    const { data: priceRows } = await admin
      .from("usage_price_book")
      .select("version, provider, model, unit, usd_per_unit, effective_from, effective_to");
    const prices = (priceRows ?? []) as PriceRow[];
    const now = new Date();

    const rows = billable.map((event) => {
      // Only a provider-and-model event can meaningfully be priced. A storage
      // snapshot or a job duration has no vendor rate to look up, so it is
      // unpriced by nature rather than missing one.
      const priceable = Boolean(event.provider && event.model);
      const price = priceable
        ? priceFor(prices, event.provider as string, event.model as string, event.unit, now)
        : null;
      const { costUsd, priceVersion } = computeCost(price, event.quantity);
      return {
        user_id: ctx.userId,
        occurred_at: now.toISOString(),
        kind: event.kind,
        provider: event.provider ?? null,
        model: event.model ?? null,
        pipeline: ctx.pipeline,
        quantity: event.quantity,
        unit: event.unit,
        cost_usd: costUsd,
        price_version: priceVersion,
        book_id: ctx.bookId ?? null,
        job_id: ctx.jobId ?? null,
        request_id: event.requestId ?? null,
        // `price_missing` is what makes an unpriced unit visible in admin.
        // Without it a model nobody has priced yet is indistinguishable from a
        // user who spent nothing, and a silent hole in cost data is the one
        // failure that survives all the way into a wrong price.
        meta: {
          ...(event.meta ?? {}),
          ...(priceable && costUsd === null ? { price_missing: true } : {}),
        },
      };
    });

    const { error } = await admin.from("usage_events").insert(rows);
    if (error) console.error("[usage] insert failed", { message: error.message });
  } catch (err) {
    console.error("[usage] record failed", err);
  }
}
