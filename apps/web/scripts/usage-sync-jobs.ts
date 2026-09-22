/**
 * Derive job cost rows from `ai_jobs`.
 *
 *   npm run usage:sync-jobs
 *
 * Also runs nightly inside the worker runtime; the logic lives in
 * src/lib/usage/tasks.ts so both callers share it.
 */
import "./load-dotenv";
import { syncJobUsage } from "../src/lib/usage/tasks";

syncJobUsage()
  .then(({ jobs, written, skipped }) => {
    console.info(`[usage:sync-jobs] ${jobs} finished jobs, ${written} recorded, ${skipped} skipped`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
