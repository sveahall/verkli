/**
 * BullMQ worker: process notification delivery jobs.
 * Run from apps/web: npm run notifications-worker (requires REDIS_URL and Supabase env in .env.local)
 *
 * Job data: { userId, type, title, body, href?, metadata? }
 * Currently writes directly to the notifications table (DB-direct pattern).
 * Can be extended with push notifications, email digests, etc.
 */

import "./load-dotenv";
import "./sentry-worker-init";
import { assertServerEnv, getRedisConnectionOptions } from "../src/lib/env";

assertServerEnv();

import { Worker } from "bullmq";
import { createAdminClient } from "../src/lib/supabase/admin";
import { QUEUE_NAMES } from "../src/lib/queue-names";
import { startHeartbeatInterval } from "../src/lib/health/worker-heartbeat";
import { Sentry } from "./sentry-worker-init";
import type { Json } from "../src/lib/supabase/types";

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
  metadata?: Json;
};

const worker = new Worker<NotificationJobData>(
  QUEUE_NAME,
  async (job) => {
    console.log("[notifications-worker] processing job", job.id);
    const { userId, type, title, body, metadata } = job.data;

    const supabase = createAdminClient();

    // The columns are `data` and (actor_id, entity_id, entity_type). There is
    // no `href` and no `metadata` on notifications — this insert named both, so
    // it failed for every job. It has never actually run: nothing in the app
    // enqueues to this queue and no worker service is deployed for it, which is
    // why a broken insert went unnoticed for as long as it did.
    //
    // `href` has no column and no equivalent; the UI builds a link from
    // entity_type + entity_id. Dropping it here rather than inventing a column,
    // and body defaults to "" because notifications.body is NOT NULL.
    const { error } = await supabase.from("notifications").insert({
      user_id: userId,
      type,
      title,
      body: body ?? "",
      data: metadata ?? {},
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
  Sentry.captureException(err);
  console.error("[notifications-worker] job failed", job?.id, err?.message);
});

worker.on("error", (err) => {
  console.error(`[${QUEUE_NAME}] Worker error:`, err.message);
});

const heartbeatInterval = startHeartbeatInterval(QUEUE_NAME);

worker.on("closed", () => clearInterval(heartbeatInterval));

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
