import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";
import { checkBudget, releaseBudget, validateJobCost, BudgetExceededError, JobCostExceededError } from "@/lib/workers/budget";

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const receiptSchema = z.object({
  provider: z.enum(["openai", "anthropic", "nim"]), model: z.string().trim().min(1), responseId: z.string().nullable(),
  inputTokens: count, outputTokens: count, cachedInputTokens: count.optional(), cacheCreationTokens: count.optional(), reasoningTokens: count.optional(),
});
export type MarketingUsage = z.infer<typeof receiptSchema>;
export class MarketingWorkError extends Error {
  constructor(public code: "MARKETING_BUDGET_EXCEEDED" | "MARKETING_BUDGET_UNAVAILABLE" | "MARKETING_USAGE_UNAVAILABLE") { super(code); }
}
export type MarketingWork = ReturnType<typeof createMarketingWork>;
export const estimateMarketingUnits = (request: object, maxOutput: number) => Buffer.byteLength(JSON.stringify(request), "utf8") + 4096 + maxOutput;

/** Budget authority is Redis. ai_jobs receipts are diagnostics, not financial
 * or dispatch authority: existing client policies do not make them immutable.
 * A new context is required for each logical draft; fallbacks share its job cap.
 */
export function createMarketingWork(authorId: string) {
  const draftId = randomUUID();
  let reservedTotal = 0;
  return {
    async run<T>(input: { stage: "draft" | "critic" | "revision" | "fallback"; provider: MarketingUsage["provider"]; units: number;
      call: (onUsage: (usage: MarketingUsage) => Promise<void>) => Promise<T> }): Promise<T> {
      const jobId = randomUUID();
      if (!Number.isSafeInteger(input.units) || input.units <= 0 || !Number.isSafeInteger(reservedTotal + input.units)) throw new MarketingWorkError("MARKETING_BUDGET_UNAVAILABLE");
      try {
        validateJobCost({ userId: authorId, pipeline: "marketing", jobSize: reservedTotal + input.units });
        await checkBudget({ userId: authorId, pipeline: "marketing", units: input.units, jobId });
      } catch (error) {
        throw new MarketingWorkError(error instanceof BudgetExceededError || error instanceof JobCostExceededError ? "MARKETING_BUDGET_EXCEEDED" : "MARKETING_BUDGET_UNAVAILABLE");
      }
      reservedTotal += input.units;
      let admin: ReturnType<typeof createAdminClient>;
      let usage: MarketingUsage | null = null;
      try {
        admin = createAdminClient();
        const { error } = await admin.from("ai_jobs").insert({ id: jobId, user_id: authorId, kind: "marketing_model_call", status: "processing",
          started_at: new Date().toISOString(), input: { draftId, provider: input.provider, stage: input.stage, reservedUnits: input.units, cumulativeReservedUnits: reservedTotal, unit: "conservative_token_bound" },
          output: { status: "started", usage: null } });
        if (error) throw new Error("Receipt unavailable");
      } catch {
        // No provider call has started. This exact unique reservation may be returned.
        await releaseBudget({ pipeline: "marketing", jobId }).catch(() => { console.error("[marketing usage] unused reservation release failed", { jobId }); });
        throw new MarketingWorkError("MARKETING_USAGE_UNAVAILABLE");
      }
      const persist = async (finished = false, failed = false) => {
        try {
          const { data, error } = await admin.from("ai_jobs").update({
            output: { status: usage ? "received" : finished ? "unknown" : "started", usage } as Json,
            ...(finished ? { status: failed ? "failed" : "completed", finished_at: new Date().toISOString() } : {}),
          }).eq("id", jobId).eq("user_id", authorId).select("id").maybeSingle();
          if (error || !data) throw new Error("Receipt unavailable");
        } catch { throw new MarketingWorkError("MARKETING_USAGE_UNAVAILABLE"); }
      };
      let result: T | undefined;
      let failure: unknown;
      let failed = false;
      try {
        result = await input.call(async value => {
          const parsed = receiptSchema.parse(value);
          if (parsed.provider !== input.provider) throw new Error("Usage provider mismatch");
          usage = parsed;
          await persist();
        });
        if (!usage) throw new Error("Provider usage receipt missing");
      } catch (error) { failure = error; failed = true; }
      // A paid request, including timeout, invalid response or failed save, is never refunded.
      await persist(true, failed);
      if (failed) throw failure;
      return result as T;
    },
  };
}

export function anthropicMarketingUsage(response: { id: string; model: string; usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null } }): MarketingUsage {
  return receiptSchema.parse({ provider: "anthropic", responseId: response.id, model: response.model,
    inputTokens: response.usage?.input_tokens, outputTokens: response.usage?.output_tokens,
    cachedInputTokens: response.usage?.cache_read_input_tokens ?? 0, cacheCreationTokens: response.usage?.cache_creation_input_tokens ?? 0 });
}
