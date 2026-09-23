import { createAdminClient } from "@/lib/supabase/admin";
import { checkCostAlerts, rollupUsage, snapshotStorage, syncJobUsage } from "./tasks";
import { describeAlert, type CostAlert } from "./alerts";

/** UTC hour the nightly maintenance runs. 03:00 is the quietest window. */
const RUN_HOUR_UTC = 3;

/** How often to check. Short enough that a restart never delays a run by long. */
const TICK_MS = 15 * 60 * 1000;

/**
 * Whether the nightly run is due.
 *
 * Deliberately not "is the clock 03:00 right now": a container that happens to
 * be restarting at 03:00 would skip the whole day, and one that ticks twice in
 * the same minute would run twice. This asks whether today's scheduled moment
 * has passed and nothing has run since it — which is correct across restarts,
 * long outages, and manual runs earlier in the day.
 */
export function shouldRunNow(lastRunAt: Date | null, now: Date, hourUtc = RUN_HOUR_UTC): boolean {
  const scheduled = new Date(now);
  scheduled.setUTCHours(hourUtc, 0, 0, 0);
  if (now < scheduled) return false;
  if (!lastRunAt) return true;
  return lastRunAt < scheduled;
}

/**
 * The last time the nightly run completed.
 *
 * Read from the newest storage snapshot rather than a dedicated marker table:
 * the snapshot is written by every run, so it is the marker, and a table that
 * exists only to say "a job ran" is a table that can disagree with reality.
 */
async function lastRun(): Promise<Date | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("usage_events")
    .select("occurred_at")
    .eq("kind", "storage_snapshot")
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return new Date(data.occurred_at);
}

/** Where alerts go. The worker passes one that reports to Sentry. */
export type AlertReporter = (alert: CostAlert) => void;

async function runOnce(report: AlertReporter): Promise<void> {
  const jobs = await syncJobUsage();
  console.info(`[usage:nightly] jobs: ${jobs.written} recorded, ${jobs.skipped} skipped`);

  const storage = await snapshotStorage((line) => console.info(line));
  console.info(
    `[usage:nightly] storage: ${(storage.totalBytes / 1e6).toFixed(1)} MB` +
      (storage.orphanedBytes ? `, ${(storage.orphanedBytes / 1e6).toFixed(1)} MB orphaned` : "")
  );

  const rolled = await rollupUsage();
  console.info(
    `[usage:nightly] rollup: ${rolled.events} events -> ${rolled.dailyRows} daily rows, ${rolled.pruned} pruned`
  );

  // After the rollup, because it reads what the rollup just wrote.
  const alerts = await checkCostAlerts();
  for (const alert of alerts) {
    console.error(`[usage:alert] ${describeAlert(alert)}`);
    report(alert);
  }
  if (alerts.length === 0) console.info("[usage:nightly] no cost alerts");
}

/**
 * Starts the nightly usage maintenance inside the worker runtime.
 *
 * Runs in-process instead of as a platform cron so nobody has to configure a
 * scheduler for it to work — it ships with the worker deploy.
 *
 * Safe to start on every replica: all three tasks are idempotent (the storage
 * snapshot replaces the day's readings, the job sync skips ids it already has,
 * the rollup upserts), so two containers racing produce the same rows as one.
 *
 * Never throws and never rejects. Metering failing must not take the workers
 * down with it.
 */
export function startUsageScheduler(report: AlertReporter = () => {}): void {
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      if (shouldRunNow(await lastRun(), new Date())) {
        console.info("[usage:nightly] starting");
        await runOnce(report);
        console.info("[usage:nightly] done");
      }
    } catch (err) {
      console.error("[usage:nightly] failed", err);
    } finally {
      running = false;
    }
  };

  void tick();
  const timer = setInterval(() => void tick(), TICK_MS);
  // Do not hold the process open on its own account.
  timer.unref?.();
  console.info(`[usage:nightly] scheduled for ${RUN_HOUR_UTC}:00 UTC, checking every 15 min`);
}
