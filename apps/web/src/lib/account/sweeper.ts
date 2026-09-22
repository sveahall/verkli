import { createAdminClient } from "@/lib/supabase/admin";
import { DELETION_GRACE_DAYS, runAccountTeardownSweep } from "./teardown";

/**
 * How often to look for deletion requests whose grace window has passed.
 *
 * No nightly hour and no "did it run today" marker, unlike the usage
 * maintenance: the sweep is a cheap indexed query, and it is self-limiting
 * because carrying a request out clears `deletion_requested_at`. An account is
 * therefore never processed twice, and a restart cannot make the day's run go
 * missing. The only cost of ticking often is that an author's data leaves
 * closer to the moment they asked for.
 */
const TICK_MS = 30 * 60 * 1000;

let timer: ReturnType<typeof setInterval> | null = null;

export function startAccountDeletionSweeper(onError: (error: unknown) => void = () => {}): () => void {
  if (timer) return stopAccountDeletionSweeper;

  const tick = async () => {
    try {
      await runAccountTeardownSweep(createAdminClient());
    } catch (error) {
      // Never let a sweep failure take the worker process down: the requests
      // stay queued and the next tick tries again.
      console.error("[account.teardown] sweep failed", {
        message: error instanceof Error ? error.message : String(error),
      });
      onError(error);
    }
  };

  timer = setInterval(() => void tick(), TICK_MS);
  timer.unref?.();
  // Say so on start, the way the usage scheduler does. A silent sweeper reads
  // in the logs exactly like one that was never wired up — and this is the
  // process the settings page's promise depends on.
  console.log(`[account.teardown] sweeping every ${TICK_MS / 60_000} min, carrying out requests older than ${DELETION_GRACE_DAYS} days`);
  void tick();
  return stopAccountDeletionSweeper;
}

export function stopAccountDeletionSweeper(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
