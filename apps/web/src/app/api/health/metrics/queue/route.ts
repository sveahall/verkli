import { NextResponse } from "next/server";
import { getQueueDepths, toQueueMetrics } from "@/lib/health/queue-metrics";

/**
 * Queue metrics endpoint for observability and alerting.
 * Returns queue depth (waiting + delayed), failed jobs, and processing (active) jobs per queue and totals.
 */
export async function GET() {
  const { redis, queues } = await getQueueDepths();
  const metrics = toQueueMetrics(redis, queues);

  const body = {
    deprecated: true,
    queues: metrics.queues,
    totals: metrics.totals,
    redis: metrics.redis,
    timestamp: metrics.timestamp,
  };

  const status = redis ? 200 : 503;
  return NextResponse.json(body, { status });
}
