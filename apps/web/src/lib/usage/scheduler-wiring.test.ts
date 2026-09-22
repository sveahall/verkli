import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * The nightly usage maintenance was wired into `start-workers.ts`, the unified
 * runtime — and nothing in production runs that file. Railway runs one service
 * per worker, each booting a single script from its own Dockerfile, so the
 * scheduler was started by no process at all. Job sync, storage snapshots,
 * rollup and cost alerts would never have run, without an error anywhere.
 *
 * A unit test of the scheduler cannot catch that: the scheduler was correct.
 * What was missing was a caller that production actually executes. So this
 * test reads the Dockerfiles, follows their CMD to the script it boots, and
 * asserts the scheduler is started from one of them.
 */
const repoRoot = path.resolve(__dirname, "../../../../..");
const dockerDir = path.join(repoRoot, "infra/docker");
const scriptsDir = path.resolve(__dirname, "../../../scripts");

function workerDockerfiles(): string[] {
  return readdirSync(dockerDir).filter((f) => f.startsWith("Dockerfile.worker."));
}

/** The script a Dockerfile's CMD boots, e.g. `scripts/audiobook-worker.ts`. */
function bootScript(dockerfile: string): string | null {
  const body = readFileSync(path.join(dockerDir, dockerfile), "utf8");
  const cmd = body.split("\n").reverse().find((l) => /^\s*(CMD|ENTRYPOINT)/.test(l));
  return cmd?.match(/scripts\/([\w.-]+\.ts)/)?.[1] ?? null;
}

describe("usage scheduler wiring", () => {
  it("is started by a script some Dockerfile actually boots", () => {
    const booted = workerDockerfiles()
      .map(bootScript)
      .filter((s): s is string => Boolean(s));

    expect(booted.length).toBeGreaterThan(0);

    // A word boundary, not a substring: `includes("startUsageScheduler(")`
    // also matches `DISABLED_startUsageScheduler(`, so the first version of
    // this test passed against the very bug it was written to catch.
    const CALL = /(?<![\w$])startUsageScheduler\s*\(/;
    const starters = booted.filter((script) =>
      CALL.test(readFileSync(path.join(scriptsDir, script), "utf8"))
    );

    expect(
      starters,
      `No worker Dockerfile boots a script that calls startUsageScheduler(). ` +
        `Booted scripts: ${booted.join(", ")}. The nightly usage maintenance ` +
        `would never run in production.`
    ).not.toHaveLength(0);
  });

  it("every worker Dockerfile boots a script that exists", () => {
    for (const dockerfile of workerDockerfiles()) {
      const script = bootScript(dockerfile);
      expect(script, `${dockerfile} has no recognisable CMD script`).toBeTruthy();
      expect(() => readFileSync(path.join(scriptsDir, script as string), "utf8")).not.toThrow();
    }
  });
});
