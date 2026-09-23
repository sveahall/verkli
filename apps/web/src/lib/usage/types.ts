/**
 * Shared vocabulary for usage metering.
 *
 * The meter measures cost; it never enforces it. Nothing in this module or its
 * consumers may block, throttle or reject a call — the daily Redis guardrails
 * in `@/lib/workers/budget` remain the only ceiling.
 */

/** Which product surface spent the money. */
export type Pipeline =
  | "tts"
  | "translation"
  | "video"
  | "editorial"
  | "cover"
  | "assistant"
  | "import"
  // Kept separate from `video` on purpose. The Redis budget bills campaign
  // drafts to the video pipeline, and its own comment calls that out: a video
  // unit is calibrated for one render, so sharing a bucket across pipelines
  // with different per-unit costs makes neither number mean anything.
  | "marketing"
  // A job kind nobody has mapped yet. Better than dropping the row: a new job
  // type is exactly when a silent skip would hurt most, because the cost is
  // real and the absence says nothing.
  | "other";

/**
 * The raw billable unit.
 *
 * Input and output tokens are deliberately separate units rather than one
 * "tokens" figure: they carry different prices, so a merged number cannot be
 * repriced when a provider changes its list.
 */
export type UsageUnit =
  | "input_tokens"
  | "output_tokens"
  | "chars"
  | "renders"
  | "bytes"
  | "ms";

export type UsageKind = "ai_call" | "storage_snapshot" | "egress_grant" | "job";

/**
 * Passed into a provider call to say who to bill.
 *
 * Optional at every call site on purpose: when a script, a seed or a test calls
 * a provider without one, nothing is measured and no existing signature breaks.
 */
export type MeterContext = {
  userId: string;
  pipeline: Pipeline;
  bookId?: string | null;
  jobId?: string | null;
};

export type UsageEventInput = {
  kind: UsageKind;
  provider?: string | null;
  model?: string | null;
  quantity: number;
  unit: UsageUnit;
  /** The provider's own id, so a line on their invoice can be traced back. */
  requestId?: string | null;
  /**
   * When the spend happened, if that is not now.
   *
   * Derived events need this. Job cost is read out of `ai_jobs` long after the
   * fact — the first sync backfilled six months — and stamping those `now` puts
   * every one of them on the sync date. Cost-per-day then reads as one
   * catastrophic day and every other day as free.
   */
  occurredAt?: string | null;
  meta?: Record<string, unknown>;
};

export type PriceRow = {
  version: string;
  provider: string;
  model: string;
  unit: string;
  usd_per_unit: number;
  effective_from: string;
  effective_to: string | null;
};
