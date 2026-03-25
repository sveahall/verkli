/**
 * Verkli Worker — BullMQ-based job processor.
 *
 * Processes import jobs by delegating to the shared processJob() from apps/web.
 * Run: `cd apps/worker && npm run dev` (or `npm start` in production)
 * Requires: REDIS_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in env.
 */

import * as path from "path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

// ─── Load .env.local from apps/web (shared env) ───
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPaths = [
  path.resolve(__dirname, "../../web/.env.local"),
  path.resolve(__dirname, "../../../.env.local"),
  path.resolve(__dirname, "../.env.local"),
];

for (const envPath of envPaths) {
  if (existsSync(envPath)) {
    config({ path: envPath, override: true });
    console.log(`[worker] loaded env from ${envPath}`);
    break;
  }
}

// ─── Import shared utilities from apps/web ───
import { processJob } from "../../web/scripts/import-worker.js";
import type { ProcessJobPayload } from "../../web/scripts/import-worker.js";
import { QUEUE_NAMES } from "../../web/src/lib/queue-names.js";
import { getRedisConnectionOptions } from "../../web/src/lib/env.js";

import { Worker } from "bullmq";

const QUEUE_NAME = QUEUE_NAMES.IMPORT;

async function main() {
  console.log("🚀 Verkli Worker starting...");

  const connection = getRedisConnectionOptions();
  if (!connection) {
    console.error(
      "[worker] REDIS_URL not set or Redis not reachable. " +
        "Set REDIS_URL (e.g. redis://localhost:6379) and ensure Redis is running."
    );
    process.exit(1);
  }

  console.log("[worker] connecting to Redis", {
    host: connection.host,
    port: connection.port,
    queue: QUEUE_NAME,
  });

  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      if (job.name === "extract" && job.data) {
        console.log(`[worker] processing job ${job.id}`, {
          importId: (job.data as ProcessJobPayload).importId,
        });
        await processJob(job.data as ProcessJobPayload);
      } else {
        console.warn(`[worker] unknown job name: ${job.name}, skipping`);
      }
    },
    {
      connection: { ...connection },
      concurrency: 3,
      stalledInterval: 30_000,
      maxStalledCount: 2,
    }
  );

  worker.on("completed", (job) => {
    console.log(`[worker] ✅ job completed: ${job.id}`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[worker] ❌ job failed: ${job?.id}`, err?.message);
  });

  worker.on("error", (err) => {
    console.error("[worker] Redis/queue error:", err.message);
  });

  console.log("[worker] listening for jobs on queue:", QUEUE_NAME);

  // Graceful shutdown
  const shutdown = async () => {
    console.log("[worker] shutting down...");
    await worker.close();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("[worker] failed to start:", err);
  process.exit(1);
});
