import type { Json } from "@/lib/supabase/types";

/**
 * The audiobook worker merges its progress into `ai_jobs.output` on every
 * chapter. Those patches used to include `cancelRequested: false` and
 * `pauseRequested: false`, so a pause or cancel that landed after the worker
 * last read the row was erased and the job kept spending.
 *
 * The control route owns those flags. A worker patch may set progress around
 * them, but it must not clear a request that is already on the row.
 */
export function preserveAudiobookControlFlags(
  current: Record<string, Json>,
  next: Record<string, Json>,
): Record<string, Json> {
  if (current.cancelRequested === true) {
    const merged: Record<string, Json> = {
      ...next,
      cancelRequested: true,
      pauseRequested: false,
    };
    if (typeof current.cancelRequestedAt === "string") {
      merged.cancelRequestedAt = current.cancelRequestedAt;
    }
    if (
      merged.controlState !== "cancelled" &&
      merged.controlState !== "failed" &&
      merged.controlState !== "completed"
    ) {
      merged.controlState = "cancel_requested";
    }
    return merged;
  }

  if (current.pauseRequested === true) {
    const merged: Record<string, Json> = {
      ...next,
      pauseRequested: true,
    };
    if (merged.controlState === "running") {
      merged.controlState = current.controlState === "paused" ? "paused" : "pause_requested";
    }
    return merged;
  }

  return next;
}
