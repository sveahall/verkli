/**
 * Roll raw usage events into daily totals, then prune the raw rows.
 *
 *   npm run usage:rollup              # roll up, prune events older than 90 days
 *   npm run usage:rollup -- --no-prune
 *
 * Intended as a nightly cron. `usage_daily` is kept forever — it is small — and
 * `usage_events` keeps 90 days so a question nobody anticipated can still be
 * answered against raw rows for a full quarter.
 *
 * Pruning happens only after the rolled-up rows are confirmed written. Deleting
 * first would trade an unanswered question for permanently lost data.
 */
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { createAdminClient } from "../src/lib/supabase/admin";
import { rollupRows, type RollupInput } from "../src/lib/usage/rollup";

function loadEnv(): void {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  for (const name of [".env.production.local", ".env.local", ".env.production", ".env"]) {
    const file = path.resolve(scriptDir, "..", name);
    if (existsSync(file)) config({ path: file, override: false });
  }
}

const RETENTION_DAYS = 90;
const PAGE = 1000;

async function main() {
  loadEnv();
  const prune = !process.argv.includes("--no-prune");
  const admin = createAdminClient();

  // Paged: PostgREST caps a response, and a silent truncation here would roll
  // up part of the history and then prune all of it.
  const all: RollupInput[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("usage_events")
      .select("user_id, occurred_at, pipeline, provider, unit, quantity, cost_usd")
      .order("occurred_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`usage_events read failed: ${error.message}`);
    if (!data?.length) break;
    all.push(...(data as RollupInput[]));
    if (data.length < PAGE) break;
  }

  const rolled = rollupRows(all);
  if (rolled.length > 0) {
    const { error } = await admin
      .from("usage_daily")
      .upsert(rolled, { onConflict: "user_id,day,pipeline,provider,unit" });
    if (error) throw new Error(`usage_daily upsert failed: ${error.message}`);
  }
  console.info(`[usage:rollup] ${all.length} events -> ${rolled.length} daily rows`);

  if (!prune) {
    console.info("[usage:rollup] pruning skipped (--no-prune)");
    return;
  }

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString();
  const { error: pruneError, count } = await admin
    .from("usage_events")
    .delete({ count: "exact" })
    .lt("occurred_at", cutoff);
  if (pruneError) throw new Error(`prune failed: ${pruneError.message}`);
  console.info(`[usage:rollup] pruned ${count ?? 0} events older than ${cutoff.slice(0, 10)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
