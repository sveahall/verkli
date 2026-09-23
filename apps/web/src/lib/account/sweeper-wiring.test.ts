import { afterEach, describe, it, expect, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

// The sweeper runs one pass on start; stub the queue read so the test does
// not need a database to assert that it announced itself.
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: () => ({ select: () => ({ not: () => ({ lt: () => ({ is: () => ({ limit: async () => ({ data: [], error: null }) }) }) }) }) }) }),
}));

/**
 * `start-workers.ts` is not what production runs. Railway boots one service per
 * worker, each from its own Dockerfile CMD, so a scheduler started only from the
 * unified runtime is started by nothing — the failure this same test already
 * caught once for the usage scheduler.
 *
 * It matters more here. The settings page tells an author their request will be
 * carried out; if no booted script runs the sweep, that is a promise the product
 * silently never keeps, with no error anywhere to notice.
 */
const repoRoot = path.resolve(__dirname, "../../../../..");
const dockerDir = path.join(repoRoot, "infra/docker");
const scriptsDir = path.resolve(__dirname, "../../../scripts");

function bootScript(dockerfile: string): string | null {
  const body = readFileSync(path.join(dockerDir, dockerfile), "utf8");
  const cmd = body.split("\n").reverse().find((line) => /^\s*(CMD|ENTRYPOINT)/.test(line));
  return cmd?.match(/scripts\/([\w.-]+\.ts)/)?.[1] ?? null;
}

describe("account deletion sweeper wiring", () => {
  it("is started by a script some worker Dockerfile actually boots", () => {
    const booted = readdirSync(dockerDir)
      .filter((file) => file.startsWith("Dockerfile.worker."))
      .map(bootScript)
      .filter((script): script is string => Boolean(script));

    expect(booted.length).toBeGreaterThan(0);

    // A word boundary, not a substring: `includes("startAccountDeletionSweeper(")`
    // would also match `DISABLED_startAccountDeletionSweeper(`.
    const CALL = /(?<![\w$])startAccountDeletionSweeper\s*\(/;
    const starters = booted.filter((script) =>
      CALL.test(readFileSync(path.join(scriptsDir, script), "utf8"))
    );

    expect(
      starters,
      `No worker Dockerfile boots a script that calls startAccountDeletionSweeper(). ` +
        `Booted scripts: ${booted.join(", ")}. Account deletion requests would be ` +
        `accepted by the API and never carried out.`
    ).not.toHaveLength(0);
  });
});

describe("account deletion sweeper visibility", () => {
  afterEach(() => vi.restoreAllMocks());

  /**
   * The usage scheduler logs "scheduled for 3:00 UTC" on start. This one did
   * not, which made a running sweeper and a sweeper nobody wired up look
   * identical in production logs — for the one process the settings page's
   * promise depends on.
   */
  it("says on start that it is running, and with what grace window", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { startAccountDeletionSweeper, stopAccountDeletionSweeper } = await import("./sweeper");
    const { DELETION_GRACE_DAYS } = await import("./teardown");
    try {
      startAccountDeletionSweeper();
      expect(log).toHaveBeenCalledWith(expect.stringContaining("[account.teardown]"));
      expect(log).toHaveBeenCalledWith(expect.stringContaining(String(DELETION_GRACE_DAYS)));
    } finally {
      stopAccountDeletionSweeper();
    }
  });
});
