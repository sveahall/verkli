import { createHash, randomUUID } from "node:crypto";

interface FenceRedis {
  set(key: string, value: string, condition: "NX"): Promise<unknown>;
  eval(script: string, keys: number, ...args: string[]): Promise<unknown>;
}
export const RELEASE_MARKETING_FENCE = `
if redis.call("GET", KEYS[1]) ~= ARGV[1] then return 0 end
return redis.call("DEL", KEYS[1])
`;
/** One owner for the entire BullMQ job, including all slots and reprompts.
 * No TTL: an interrupted/unknown paid scope requires reconciliation, not takeover.
 * Redis must retain this key; losing/evicting Redis state invalidates the fence.
 * Operators must stop workers and reconcile receipts before clearing an orphan.
 */
export async function acquireMarketingModelFence(redis: FenceRedis, userId: string, jobId: string) {
  if (!userId || !jobId) throw new Error("Marketing job identity is missing");
  const key = `marketing:model-fence:${createHash("sha256").update(JSON.stringify([userId, jobId])).digest("hex")}`;
  const owner = randomUUID();
  // A lost acknowledgement never authorizes dispatch or an unconditional delete.
  if (await redis.set(key, owner, "NX") !== "OK") throw new Error("Marketing model work is already reserved or unresolved. Review its outcome before retrying.");
  return {
    async release() {
      if (await redis.eval(RELEASE_MARKETING_FENCE, 1, key, owner) !== 1) throw new Error("Marketing model reservation could not be released by its owner");
    },
  };
}
