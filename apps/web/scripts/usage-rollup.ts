/**
 * Roll raw usage events into daily totals, then prune the raw rows.
 *
 *   npm run usage:rollup
 *   npm run usage:rollup -- --no-prune
 *
 * Also runs nightly inside the worker runtime; the logic lives in
 * src/lib/usage/tasks.ts so both callers share it.
 */
import "./load-dotenv";
import { rollupUsage } from "../src/lib/usage/tasks";

rollupUsage({ prune: !process.argv.includes("--no-prune") })
  .then(({ events, dailyRows, pruned }) => {
    console.info(`[usage:rollup] ${events} events -> ${dailyRows} daily rows, ${pruned} pruned`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
