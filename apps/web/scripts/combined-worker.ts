/**
 * Combined BullMQ worker: runs import + translation workers in a single process.
 * Useful for cost-effective deployment (e.g. Railway single service).
 *
 * Usage:  npx tsx apps/web/scripts/combined-worker.ts
 * Env:    REDIS_URL, SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY (see .env.local)
 */

import "./load-dotenv";
import { assertServerEnv, getRedisConnectionOptions } from "../src/lib/env";

assertServerEnv();

const redis = getRedisConnectionOptions();
if (!redis) {
  console.error("[combined-worker] REDIS_URL is required. Set it in .env.local or environment.");
  process.exit(1);
}

console.log("[combined-worker] Starting import + translation workers...");

// Dynamically import workers so they each register their own BullMQ Worker instance.
// Both workers call assertServerEnv() on import and set up their own Worker listeners.
const importWorker = import("./import-worker");
const translationWorker = import("./translation-worker");

Promise.all([importWorker, translationWorker]).then(() => {
  console.log("[combined-worker] Both workers are running.");
  console.log("[combined-worker] Press Ctrl+C to stop.");
});

// Graceful shutdown
function shutdown() {
  console.log("\n[combined-worker] Shutting down...");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
