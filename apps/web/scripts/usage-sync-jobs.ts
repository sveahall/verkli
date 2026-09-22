/**
 * Derive job cost rows from `ai_jobs`.
 *
 *   npm run usage:sync-jobs
 *
 * Job duration is derived from the table rather than instrumented at the
 * fifteen places that set a status, because `ai_jobs` already records user,
 * book, kind, status and both timestamps — and because deriving also covers
 * every job that ran before metering existed, which is the history the pricing
 * decision actually needs.
 *
 * Idempotent: job ids already present as `kind = 'job'` rows are skipped, so a
 * re-run adds only what is new. There is deliberately no unique index backing
 * this; a nightly single-instance cron does not race with itself, and adding
 * the constraint would have meant pushing a second session's unfinished
 * migration along with it.
 */
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

import { createAdminClient } from "../src/lib/supabase/admin";
import { jobToUsage } from "../src/lib/usage/job-usage";
import { recordUsage } from "../src/lib/usage/meter";

/**
 * Loaded before any client is built, not at import time: `createAdminClient`
 * reads the environment when it is called, so the env must be in place by then
 * and not merely by the time this module finished importing.
 */
function loadEnv(): void {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  for (const name of [".env.production.local", ".env.local", ".env.production", ".env"]) {
    const file = path.resolve(scriptDir, "..", name);
    if (existsSync(file)) config({ path: file, override: false });
  }
}

async function main() {
  loadEnv();
  const admin = createAdminClient();

  const { data: jobs, error } = await admin
    .from("ai_jobs")
    .select("id, user_id, kind, book_id, started_at, finished_at, status")
    .not("finished_at", "is", null);
  if (error) throw new Error(`ai_jobs read failed: ${error.message}`);

  const { data: seen, error: seenError } = await admin
    .from("usage_events")
    .select("job_id")
    .eq("kind", "job")
    .not("job_id", "is", null);
  if (seenError) throw new Error(`usage_events read failed: ${seenError.message}`);

  const already = new Set((seen ?? []).map((row) => row.job_id));

  let written = 0;
  let skipped = 0;
  for (const job of jobs ?? []) {
    if (already.has(job.id)) { skipped += 1; continue; }
    const usage = jobToUsage(job);
    if (!usage) { skipped += 1; continue; }
    await recordUsage(usage.ctx, usage.events);
    written += 1;
  }

  console.info(
    `[usage:sync-jobs] ${jobs?.length ?? 0} finished jobs, ${written} recorded, ${skipped} skipped`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
