import { getHeartbeats, getHeartbeatStaleMs } from "@/lib/health/worker-heartbeat";
import { QUEUE_NAMES } from "@/lib/queue-names";

/** Publishing uses approved copy and performs no AI generation or budget reservation. */
export async function isCampaignPublisherReady(): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const health = await Promise.race([
      getHeartbeats(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Publisher health timed out")), 3_000); }),
    ]);
    const heartbeat = health.heartbeats[QUEUE_NAMES.SOCIAL_PUBLISH];
    const age = Date.now() - Date.parse(heartbeat?.lastSeen ?? "");
    return health.redis && !!heartbeat && !heartbeat.stale && !heartbeat.crashed
      && Number.isFinite(age) && age >= 0 && age <= getHeartbeatStaleMs();
  } catch { return false; }
  finally { if (timer) clearTimeout(timer); }
}
