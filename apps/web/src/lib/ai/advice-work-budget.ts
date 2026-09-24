import { createHash, randomUUID } from "node:crypto";
import Redis from "ioredis";
import { getRedisClientOptions } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";
import { checkBudget } from "@/lib/workers/budget";
import { recordUsage } from "@/lib/usage/meter";
import type { MeterContext } from "@/lib/usage/types";

type Stage = "draft" | "critique" | "revision";
export type AdviceReceipt = {
  model: string;
  responseId: string | null;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
};
type Entry = { stage: Stage; provider: "openai" | "anthropic"; reservedUnits: number;
  reservationId: string; status: "started" | "received" | "unknown"; usage: AdviceReceipt | null };

export class AdviceBudgetError extends Error {
  constructor() {
    super("Advice model work is unavailable or unresolved. Its cost must be reconciled before retrying.");
    this.name = "AdviceBudgetError";
  }
}

let sharedRedis: Redis | undefined;
const releaseOwner = `
if redis.call("GET", KEYS[1]) ~= ARGV[1] then return 0 end
return redis.call("DEL", KEYS[1])
`;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** Existing assistant/agent token-unit policy; no new allowance or currency cap.
 * Like the marketing model fence, this has NO TTL. An interrupted process may
 * have dispatched paid work. Redis persistence/non-eviction is required: losing
 * that state invalidates this fence, so operators must reconcile before restart.
 * A user/book fence also blocks retries with a new client request ID or a deleted
 * ai_jobs row. It is released only after a durable, fully known terminal outcome.
 */
export async function beginAdviceWork(input: {
  meter?: MeterContext; requestId: string; signal?: AbortSignal;
}) {
  input.signal?.throwIfAborted();
  const meter = input.meter;
  if (!meter?.userId || !meter.bookId || !input.requestId) throw new AdviceBudgetError();
  const options = getRedisClientOptions();
  if (!options) throw new AdviceBudgetError();
  const redis = sharedRedis ??= new Redis(options);
  const key = `assistant:advice-fence:${hash([meter.userId, meter.bookId])}`;
  const owner = randomUUID();
  // No release on an uncertain SET acknowledgement, and never dispatch then.
  if (await redis.set(key, owner, "NX") !== "OK") throw new AdviceBudgetError();
  const digest = hash(["assistant_advice", meter.userId, meter.bookId, input.requestId]);
  const jobId = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
  const admin = createAdminClient();
  const stages: Entry[] = [];
  let unresolved = false;
  let finished = false;
  async function release() {
    if (await redis.eval(releaseOwner, 1, key, owner) !== 1) throw new AdviceBudgetError();
  }
  const { error: insertError } = await admin.from("ai_jobs").insert({
    id: jobId, user_id: meter.userId, book_id: meter.bookId, kind: "assistant_advice",
    status: "processing", started_at: new Date().toISOString(),
    input: { requestFingerprint: digest }, output: { stages: [] },
  });
  if (insertError) {
    // No paid work happened in this owner. A duplicate does not re-dispatch.
    await release();
    throw new AdviceBudgetError();
  }
  async function persist(status = "processing", error: string | null = null) {
    try {
      const { data, error: writeError } = await admin.from("ai_jobs").update({
        status, error, output: { stages, reconciliationRequired: unresolved,
          settlement: "conservative_reservations_retained" } as unknown as Json,
        ...(status !== "processing" ? { finished_at: new Date().toISOString() } : {}),
      }).eq("id", jobId).eq("user_id", meter!.userId).eq("status", "processing").select("id").maybeSingle();
      if (writeError || !data) throw new AdviceBudgetError();
    } catch {
      unresolved = true;
      throw new AdviceBudgetError();
    }
  }
  return {
    async run<T>(stage: Stage, provider: Entry["provider"], units: number,
      call: (receive: (receipt: AdviceReceipt) => Promise<void>) => Promise<T>): Promise<T> {
      if (finished || unresolved || stages.some(entry => entry.stage === stage)) throw new AdviceBudgetError();
      input.signal?.throwIfAborted();
      if (!Number.isSafeInteger(units) || units <= 0) throw new AdviceBudgetError();
      // Each physical stage gets its own fresh reservation ID. Never reuse an
      // expired/idempotent budget marker as permission for another paid call.
      const reservationId = `${jobId}:${owner}:${stage}`;
      try { await checkBudget({ userId: meter.userId, pipeline: "agent", jobId: reservationId, units }); }
      catch { throw new AdviceBudgetError(); }
      const entry: Entry = { stage, provider, reservedUnits: units, reservationId, status: "started", usage: null };
      stages.push(entry);
      await persist(); // Lost acknowledgement => keep fence; no provider call.
      input.signal?.throwIfAborted();
      let received = false;
      try {
        const result = await call(async (receipt) => {
          if (received || !receipt.model?.trim() || [receipt.inputTokens, receipt.outputTokens,
            receipt.cachedInputTokens ?? 0, receipt.reasoningTokens ?? 0,
            receipt.cacheCreationInputTokens ?? 0, receipt.cacheReadInputTokens ?? 0]
            .some(count => !Number.isSafeInteger(count) || count < 0)
            || (receipt.cachedInputTokens ?? 0) > receipt.inputTokens
            || (receipt.reasoningTokens ?? 0) > receipt.outputTokens) throw new AdviceBudgetError();
          entry.usage = receipt;
          entry.status = "received";
          const actual = receipt.inputTokens + receipt.outputTokens
            + (receipt.cacheCreationInputTokens ?? 0) + (receipt.cacheReadInputTokens ?? 0);
          if (actual > units) unresolved = true;
          await persist(); // Meter success alone never proves receipt persistence.
          if (unresolved) throw new AdviceBudgetError();
          received = true;
          await recordUsage({ ...meter, jobId }, [
            { kind: "ai_call", provider, model: receipt.model, requestId: receipt.responseId,
              quantity: receipt.inputTokens, unit: "input_tokens" },
            { kind: "ai_call", provider, model: receipt.model, requestId: receipt.responseId,
              quantity: receipt.outputTokens, unit: "output_tokens" },
          ]);
        });
        if (!received) throw new AdviceBudgetError();
        return result;
      } catch (error) {
        if (!received || error instanceof AdviceBudgetError) {
          unresolved = true;
          if (!entry.usage) entry.status = "unknown";
          try { await persist(); } catch { /* Existing started marker and fence remain. */ }
          throw new AdviceBudgetError();
        }
        // A valid durable receipt survives invalid JSON/refusal/content errors.
        throw error;
      }
    },
    async finish(success: boolean) {
      if (finished) return;
      finished = true;
      await persist(success && !unresolved ? "completed" : "failed", unresolved ? "ADVICE_COST_UNRESOLVED" : success ? null : "ADVICE_FAILED");
      // Conservative settlement: no refund once reserved, even on uncertainty.
      if (!unresolved) await release();
    },
  };
}
