import { NextResponse } from "next/server";
import { getHeartbeats } from "@/lib/health/worker-heartbeat";

/**
 * Worker crash detection: returns last heartbeat per queue and which workers are considered crashed (stale heartbeat).
 */
export async function GET() {
  const { redis, heartbeats } = await getHeartbeats();

  const crashed = Object.entries(heartbeats)
    .filter(([, s]) => s.crashed)
    .map(([name]) => name);

  const body = {
    deprecated: true,
    redis,
    heartbeats,
    crashed,
    timestamp: new Date().toISOString(),
  };

  const status = redis ? 200 : 503;
  return NextResponse.json(body, { status });
}
