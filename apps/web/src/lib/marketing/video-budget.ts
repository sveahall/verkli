import { randomUUID } from "node:crypto";
import {
  BudgetExceededError,
  JobCostExceededError,
  checkBudget,
  releaseBudget,
  validateJobCost,
} from "@/lib/workers/budget";
import { apiError, E_AI_BUDGET_EXCEEDED, E_AI_JOB_TOO_LARGE } from "@/lib/api-errors";

/**
 * Daily spend gate for the image-to-video routes.
 *
 * The queued marketing pipeline has always reserved budget through
 * `lib/workers/budget`, but the three Higgsfield callers run synchronously
 * inside the request and never touched it: a Pro subscription plus a
 * per-minute rate limit was the entire ceiling on provider spend. These are the
 * most expensive calls on the platform, so they get the same reservation the
 * worker path has.
 *
 * `jobId` is minted per request rather than taken from BullMQ, because there is
 * no job here. It exists solely so `releaseBudget` can refund exactly once.
 */
export type VideoBudgetReservation = { jobId: string; units: number };

export async function reserveVideoBudget(input: {
  userId: string;
  units: number;
}): Promise<
  { ok: true; reservation: VideoBudgetReservation } | { ok: false; response: Response }
> {
  const jobId = randomUUID();
  const units = Math.max(1, Math.ceil(input.units));
  try {
    validateJobCost({ userId: input.userId, pipeline: "video", jobSize: units, jobId });
    await checkBudget({ userId: input.userId, pipeline: "video", units, jobId });
  } catch (err) {
    // Build the client detail from the structured snapshot, never from
    // `err.message`: that string embeds the user id and the Redis budget key,
    // and neither belongs in an HTTP response body.
    if (err instanceof JobCostExceededError) {
      const { jobSize, cap, unit } = err.details;
      return {
        ok: false,
        response: apiError(E_AI_JOB_TOO_LARGE, 413, {
          detail: `This request needs ${jobSize} ${unit} but the per-job limit is ${cap}.`,
        }),
      };
    }
    if (err instanceof BudgetExceededError) {
      return {
        ok: false,
        response: apiError(E_AI_BUDGET_EXCEEDED, 429, {
          detail: `Daily video generation limit of ${err.details.limit} reached. Try again tomorrow.`,
        }),
      };
    }
    throw err;
  }
  return { ok: true, reservation: { jobId, units } };
}

/**
 * Refund a reservation whose generation never produced anything. Safe to call
 * more than once: the underlying release is marker-guarded and idempotent.
 */
export async function refundVideoBudget(reservation: VideoBudgetReservation): Promise<void> {
  try {
    await releaseBudget({ pipeline: "video", jobId: reservation.jobId });
  } catch (err) {
    // A failed refund must never mask the original failure the caller is
    // already reporting; the daily window expires on its own.
    console.warn(
      "[video budget] refund failed:",
      err instanceof Error ? err.message : String(err)
    );
  }
}
