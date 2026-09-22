/**
 * Unified worker runtime: starts all BullMQ workers in a single process.
 * Use for production when running one container for all workers.
 *
 * Workers started:
 *   import-worker, translation-worker, audiobook-worker, recommendations-worker,
 *   marketing-worker, social-publish-worker, notifications-worker
 *
 * Also runs nightly usage maintenance (job sync, storage snapshot, rollup) at
 * 03:00 UTC. In-process rather than a platform cron so it needs no scheduler
 * configured to work, and idempotent so extra replicas are harmless.
 *
 * Usage:  npx tsx apps/web/scripts/start-workers.ts
 * Env:    REDIS_URL, SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import "./load-dotenv";
import "./sentry-worker-init";
import { validateWorkerEnv } from "./worker-env";
import { setWorkersStartedAt } from "../src/lib/health/worker-heartbeat";
import { Sentry } from "./sentry-worker-init";
import { startUsageScheduler } from "../src/lib/usage/scheduler";
import { startAccountDeletionSweeper } from "../src/lib/account/sweeper";
import { describeAlert } from "../src/lib/usage/alerts";

validateWorkerEnv();

const workerScripts = [
  { name: "import-worker", mod: () => import("./import-worker") },
  { name: "translation-worker", mod: () => import("./translation-worker") },
  { name: "audiobook-worker", mod: () => import("./audiobook-worker") },
  { name: "recommendations-worker", mod: () => import("./recommendations-worker") },
  { name: "marketing-worker", mod: () => import("./marketing-worker") },
  { name: "social-publish-worker", mod: () => import("./social-publish-worker") },
  { name: "notifications-worker", mod: () => import("./notifications-worker") },
] as const;

let isShuttingDown = false;

function shutdown(signal?: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(
    signal
      ? `\n[start-workers] ${signal} received, shutting down...`
      : "\n[start-workers] Shutting down..."
  );
  process.exit(0);
}

process.on("uncaughtException", async (err) => {
  console.error("[start-workers] uncaughtException:", err?.message ?? err);
  if (err?.stack) console.error(err.stack);
  if (isShuttingDown) return;
  isShuttingDown = true;
  await new Promise((r) => setTimeout(r, 2000));
  process.exit(1);
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- second param is required by Node's unhandledRejection signature
process.on("unhandledRejection", async (reason, _promise) => {
  console.error("[start-workers] unhandledRejection:", reason);
  if (isShuttingDown) return;
  isShuttingDown = true;
  await new Promise((r) => setTimeout(r, 2000));
  process.exit(1);
});

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

console.log("[start-workers] Starting unified worker runtime...");

Promise.all(
  workerScripts.map(({ name, mod }) =>
    mod().then(() => {
      console.log(`[${name}] started`);
    })
  )
).then(async () => {
  const startedAt = Date.now();
  await setWorkersStartedAt(startedAt);
  console.log("[start-workers] all workers started");
  console.log(
    "[start-workers] workers: import, translation, audiobook, recommendations, marketing, social, notifications"
  );

  // Nightly usage maintenance runs in-process rather than as a platform cron,
  // so it needs no scheduler configured anywhere to work — it ships with this
  // deploy. Started last: it must never delay or fail worker startup.
  startUsageScheduler((alert) => {
    // A cost anomaly is not an exception, so it goes in as a warning message —
    // captureException would bury it under a synthetic stack trace.
    Sentry.captureMessage(`[usage] ${describeAlert(alert)}`, "warning");
  });

  // Deletion requests are carried out here for the same reason: in-process, so
  // the promise the settings page makes cannot depend on a cron somebody has to
  // remember to configure. Also started last, and its failures never stop it.
  startAccountDeletionSweeper((error) => {
    Sentry.captureException(error);
  });
});
