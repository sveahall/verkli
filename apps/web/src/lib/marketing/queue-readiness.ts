import { getHeartbeats, getHeartbeatStaleMs } from "@/lib/health/worker-heartbeat";
import { QUEUE_NAMES } from "@/lib/queue-names";

const UNAVAILABLE_DETAIL = "Campaign generation is temporarily unavailable. Please try again later or contact support.";

type Readiness = { ok: true } | {
  ok: false;
  code: "MARKETING_GENERATION_UNAVAILABLE" | "MARKETING_BUDGET_UNAVAILABLE";
  detail: string;
};

/** Read-only admission check. It neither reserves budget nor starts a worker. */
export async function getMarketingQueueReadiness(): Promise<Readiness> {
  const budgetKeys = ["MARKETING_DAILY_BUDGET", "MARKETING_JOB_CAP_UNITS"];
  if (!budgetKeys.every((key) => Number.isSafeInteger(Number(process.env[key])) && Number(process.env[key]) > 0)) {
    console.error("[marketing queue] admission blocked: explicit marketing budget configuration missing or invalid");
    return { ok: false, code: "MARKETING_BUDGET_UNAVAILABLE", detail: UNAVAILABLE_DETAIL };
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const health = await Promise.race([
      getHeartbeats(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Worker health check timed out")), 3_000);
      }),
    ]);
    const heartbeat = health.heartbeats[QUEUE_NAMES.MARKETING];
    const seenAt = heartbeat?.lastSeen ? Date.parse(heartbeat.lastSeen) : NaN;
    const ageMs = Date.now() - seenAt;
    if (!health.redis || !heartbeat || heartbeat.stale || heartbeat.crashed
      || !Number.isFinite(ageMs) || ageMs < 0 || ageMs > getHeartbeatStaleMs()) {
      console.error("[marketing queue] admission blocked: no verified fresh marketing consumer");
      return { ok: false, code: "MARKETING_GENERATION_UNAVAILABLE", detail: UNAVAILABLE_DETAIL };
    }
    return { ok: true };
  } catch {
    console.error("[marketing queue] admission blocked: worker health could not be read");
    return { ok: false, code: "MARKETING_GENERATION_UNAVAILABLE", detail: UNAVAILABLE_DETAIL };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
