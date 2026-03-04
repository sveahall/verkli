import { NextResponse } from "next/server";
import {
  getQueueDepths,
  toQueueMetrics,
  type QueueDepth,
} from "@/lib/health/queue-metrics";
import { getHeartbeats, getWorkersStartedAt } from "@/lib/health/worker-heartbeat";

/**
 * Canonical health endpoint: Redis, queue metrics (depth, failed, active per queue + totals), worker heartbeats (lastSeen, stale/crashed).
 */
export async function GET() {
  const [depthsResult, heartbeatsResult, workersStartedAt] = await Promise.all([
    getQueueDepths(),
    getHeartbeats(),
    getWorkersStartedAt(),
  ]);

  const { redis, queues } = depthsResult;
  const { heartbeats } = heartbeatsResult;

  const queueDepths: Record<string, QueueDepth | null> = {};
  for (const [name, status] of Object.entries(queues)) {
    queueDepths[name] = status.error ? null : status.depth;
  }

  const metrics = toQueueMetrics(redis, queues);

  const crashed = Object.entries(heartbeats)
    .filter(([, s]) => s.crashed)
    .map(([name]) => name);

  const workerAvailability = redis
    ? "available"
    : "unavailable";

  const workersUptimeSeconds =
    workersStartedAt != null
      ? (Date.now() - workersStartedAt) / 1000
      : null;

  const body = {
    redis: {
      connected: redis,
      status: redis ? "ok" : "disconnected",
    },
    queueDepths,
    queueMetrics: {
      queues: metrics.queues,
      totals: metrics.totals,
    },
    heartbeats,
    crashed,
    workerAvailability,
    processUptimeSeconds: process.uptime(),
    workersUptimeSeconds,
    timestamp: new Date().toISOString(),
  };

  const status = redis ? 200 : 503;
  return NextResponse.json(body, { status });
}
