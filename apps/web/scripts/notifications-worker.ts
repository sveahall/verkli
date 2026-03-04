/**
 * BullMQ worker: process notification delivery jobs.
 * Run from apps/web: npm run notifications-worker (requires REDIS_URL and Supabase env in .env.local)
 *
 * Job data: { userId, type, title, body, href?, metadata? }
 * Currently writes directly to the notifications table (DB-direct pattern).
 * Can be extended with push notifications, email digests, etc.
 */

import "./load-dotenv";
import { assertServerEnv, getRedisConnectionOptions } from "../src/lib/env";

assertServerEnv();

import { Worker } from "bullmq";
import { createAdminClient } from "../src/lib/supabase/admin";
import { QUEUE_NAMES } from "../src/lib/queue-names";
import { startHeartbeatInterval } from "../src/lib/health/worker-heartbeat";

const QUEUE_NAME = QUEUE_NAMES.NOTIFICATIONS;

const redis = getRedisConnectionOptions();
if (!redis) {
  console.error(`[${QUEUE_NAME}] REDIS_URL is required. Set it in .env.local or environment.`);
  process.exit(1);
}

type NotificationJobData = {
  userId: string;
  type: string;
  title: string;
  body: string;
  href?: string;
  metadata?: Record<string, unknown>;
};

const worker = new Worker<NotificationJobData>(
  QUEUE_NAME,
  async (job) => {
    console.log("[notifications-worker] processing job", job.id);
    const { userId, type, title, body, href, metadata } = job.data;

    const supabase = createAdminClient();

    const { error } = await supabase.from("notifications").insert({
      user_id: userId,
      type,
      title,
      body,
      href: href ?? null,
      metadata: metadata ?? null,
      read: false,
    });

    if (error) {
      console.error(`[${QUEUE_NAME}] Failed to insert notification:`, error.message);
      throw new Error(`DB insert failed: ${error.message}`);
    }

    console.log(`[${QUEUE_NAME}] Notification delivered for user ${userId}`);
  },
  {
    connection: redis,
    concurrency: 10,
  }
);

worker.on("completed", (job) => {
  console.log(`[${QUEUE_NAME}] Job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.error("[notifications-worker] job failed", job?.id, err?.message);
});

worker.on("error", (err) => {
  console.error(`[${QUEUE_NAME}] Worker error:`, err.message);
});

const heartbeatInterval = startHeartbeatInterval(QUEUE_NAME);

process.on("SIGTERM", async () => {
  console.log(`[${QUEUE_NAME}] Shutting down...`);
  clearInterval(heartbeatInterval);
  await worker.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log(`[${QUEUE_NAME}] Shutting down...`);
  clearInterval(heartbeatInterval);
  await worker.close();
  process.exit(0);
});

console.log("[notifications-worker] started");
