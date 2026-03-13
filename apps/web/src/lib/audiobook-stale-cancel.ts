import { createAdminClient } from "@/lib/supabase/admin";

/** How long to wait after cancel was requested before force-failing the job. */
export const CANCEL_STALE_MS = 2 * 60 * 1000;

/**
 * Returns true if a cancel_requested job is stale — i.e. the worker hasn't
 * acted on it within the timeout window. Uses `cancelRequestedAt` from output
 * when available, falls back to the row's `updated_at`.
 */
export function isCancelStale(
  output: Record<string, unknown> | null,
  updatedAt: string
): boolean {
  if (!output) return false;
  if (output.controlState !== "cancel_requested") return false;

  const timestamp =
    typeof output.cancelRequestedAt === "string"
      ? output.cancelRequestedAt
      : updatedAt;

  const elapsed = Date.now() - new Date(timestamp).getTime();
  return elapsed > CANCEL_STALE_MS;
}

/**
 * Force-fail a stuck cancel_requested job via the admin client.
 * Returns the merged output written to the DB.
 */
export async function forceFailCancelledJob(
  jobId: string,
  currentOutput: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const admin = createAdminClient();

  const failedOutput: Record<string, unknown> = {
    ...currentOutput,
    controlState: "cancelled",
    cancelRequested: false,
    pauseRequested: false,
    errorMessage: "Cancellation timed out — job force-stopped.",
  };

  await admin
    .from("ai_jobs")
    .update({
      status: "failed",
      finished_at: new Date().toISOString(),
      output: failedOutput,
    })
    .eq("id", jobId);

  console.info("[audiobook stale-cancel] force-failed stuck job:", jobId);
  return failedOutput;
}
