import "server-only";
import { z } from "zod";
import { DeliveryLedgerError, type DeliveryRepository } from "./delivery-ledger";

const state = z.enum(["scheduled", "processing", "failed", "uncertain", "simulated", "published", "cancelled"]);
const recordSchema = z.object({
  id: z.string().min(1), userId: z.string().min(1), postId: z.string().min(1), approvedRevision: z.string().min(1),
  text: z.string().min(1), channel: z.literal("x"), mode: z.enum(["simulation", "live"]), scheduledFor: z.string().datetime(),
  state, version: z.number().int().positive(), attempts: z.number().int().nonnegative(),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime(), error: z.string().optional(), providerId: z.string().min(1).optional(),
  events: z.array(z.object({ state, at: z.string().datetime(), attempt: z.number().int().nonnegative(), error: z.string().optional() })).min(1),
});
/** Inject the service-role client only after the separately reviewed schema exists.
 * These RPCs have no anon/authenticated grants. No production caller is wired yet.
 */
export interface DeliveryRpcClient {
  rpc(name: "marketing_delivery_get" | "marketing_delivery_insert" | "marketing_delivery_cas", args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}
export function createSupabaseDeliveryRepository(client: DeliveryRpcClient): DeliveryRepository {
  async function call(name: Parameters<DeliveryRpcClient["rpc"]>[0], args: Record<string, unknown>, operation: string) {
    let result;
    try { result = await client.rpc(name, args); }
    catch { throw new DeliveryLedgerError(`[campaign delivery] Could not ${operation}.`, 503); }
    if (result.error) throw new DeliveryLedgerError(`[campaign delivery] Could not ${operation}.`, 503);
    return result.data;
  }
  async function mutate(name: "marketing_delivery_insert" | "marketing_delivery_cas", args: Record<string, unknown>, operation: string) {
    const data = await call(name, args, operation);
    if (typeof data !== "boolean") throw new DeliveryLedgerError("[campaign delivery] Invalid protected ledger response.", 503);
    return data;
  }
  return {
    async get(id, userId) {
      const data = await call("marketing_delivery_get", { p_id: id, p_user_id: userId }, "read the protected delivery ledger");
      if (data === null) return null;
      const parsed = recordSchema.safeParse(data);
      if (!parsed.success || parsed.data.id !== id || parsed.data.userId !== userId) throw new DeliveryLedgerError("[campaign delivery] Invalid protected ledger response.", 503);
      return parsed.data;
    },
    insert: record => mutate("marketing_delivery_insert", { p_record: record }, "create the protected delivery record"),
    compareAndSwap: (previous, next) => mutate("marketing_delivery_cas", {
      p_id: previous.id, p_user_id: previous.userId, p_expected_version: previous.version, p_next: next,
    }, "update the protected delivery record"),
  };
}
