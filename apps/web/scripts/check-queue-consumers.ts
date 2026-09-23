/**
 * Verify every BullMQ queue the app can enqueue to has a worker consuming it.
 *
 *   npm run check:queue-consumers              # report only, exit 0
 *   npm run check:queue-consumers -- --strict  # exit 1 on any error
 *
 * Why this exists
 * ---------------
 * Three of the seven queues had no worker service deployed. `queue.add()`
 * succeeds regardless — BullMQ has no notion of a required consumer — so the
 * route answered 200 and the job sat in Redis forever. An unconsumed queue is
 * byte-for-byte indistinguishable from an idle one, so nothing surfaced it:
 * not the health endpoint, not the admin queue page, not Railway.
 *
 * A queue with no producer is a different thing and is reported as such rather
 * than as a failure. `notifications` is declared in QUEUE_NAMES and monitored,
 * but nothing in the codebase enqueues to it — no jobs are lost, so a missing
 * worker there is untidy, not broken. Conflating the two would make this check
 * red for a harmless reason, and a check that is red for harmless reasons stops
 * being read.
 *
 * A skip is not a pass: without REDIS_URL it reports SKIPPED and, under
 * --strict, exits 1.
 */

import * as path from "node:path";
import { existsSync } from "node:fs";
import { lookup } from "node:dns/promises";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { Queue } from "bullmq";
import { QUEUE_NAMES } from "../src/lib/queue-names";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const strict = process.argv.includes("--strict");

for (const name of [".env.production.local", ".env.local", ".env.production", ".env"]) {
  const file = path.resolve(scriptDir, "..", name);
  if (existsSync(file)) config({ path: file, override: false });
}

/**
 * Queues nothing in the app enqueues to. A missing worker for one of these
 * loses no work. Keep this list honest — moving a queue in here to silence the
 * check is how the original bug would come back.
 */
const NO_PRODUCER: ReadonlySet<string> = new Set([QUEUE_NAMES.NOTIFICATIONS]);

const errors: string[] = [];
const notes: string[] = [];

function skip(reason: string): never {
  console.log("\n══ Queue consumer check ══\n");
  console.log(`⏭  SKIPPED — ${reason}`);
  console.log("   A skip is not a pass. Run this where Redis is reachable.\n");
  if (strict) {
    console.error("✖  --strict treats a skip as a failure.\n");
    process.exit(1);
  }
  process.exit(0);
}

function parseRedis(url: string): { host: string; port: number; password?: string } | null {
  try {
    const u = new URL(url);
    return {
      host: u.hostname,
      port: Number(u.port || 6379),
      ...(u.password ? { password: decodeURIComponent(u.password) } : {}),
    };
  } catch {
    return null;
  }
}

async function main() {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) skip("missing REDIS_URL");

  const connection = parseRedis(redisUrl);
  if (!connection) {
    console.error(`\n✖  REDIS_URL is not a valid URL.\n`);
    process.exit(1);
  }

  // Resolve the host before touching BullMQ.
  //
  // Railway's REDIS_URL is `redis.railway.internal`, which resolves only from
  // inside their network — including under `railway run`, which injects the
  // variables but runs the process locally. An env-var heuristic does not work:
  // `railway run` sets RAILWAY_ENVIRONMENT too, so the process cannot tell from
  // its environment whether it is really inside. DNS answers it directly.
  //
  // Without this, seven queues each emit two ioredis ENOTFOUND errors and the
  // report claims seven problems, none of them a real queue fault — a failure
  // mode that teaches the reader to ignore this check.
  try {
    await lookup(connection.host);
  } catch {
    skip(
      `${connection.host} does not resolve from here. Railway's Redis is on their internal ` +
        "network — run this from inside a Railway service, or point REDIS_URL at a reachable host."
    );
  }

  console.log(`\n══ Queue consumer check — ${connection.host}:${connection.port} ══\n`);

  const names = Object.values(QUEUE_NAMES);
  const queues: Queue[] = [];

  try {
    for (const name of names) {
      const queue = new Queue(name, {
        connection: {
          ...connection,
          // One attempt, then give up. The default retry strategy makes an
          // unreachable Redis look like a slow one, forever.
          maxRetriesPerRequest: 1,
          connectTimeout: 5_000,
          retryStrategy: () => null,
          enableOfflineQueue: false,
        },
      });
      queues.push(queue);

      let workers = 0;
      let counts: Record<string, number> = {};
      try {
        workers = (await queue.getWorkers()).length;
        counts = (await queue.getJobCounts("waiting", "delayed", "active")) as Record<
          string,
          number
        >;
      } catch (err) {
        errors.push(
          `${name}: could not be inspected — ${err instanceof Error ? err.message : String(err)}`
        );
        console.log(`   ✖ ${name.padEnd(24)} unreachable`);
        continue;
      }

      const pending = (counts.waiting ?? 0) + (counts.delayed ?? 0) + (counts.active ?? 0);
      const noProducer = NO_PRODUCER.has(name);
      const ok = workers > 0;

      const label = ok
        ? "✔"
        : noProducer
          ? "·"
          : "✖";
      console.log(
        `   ${label} ${name.padEnd(24)} workers=${workers}  pending=${pending}` +
          (noProducer ? "  (no producer in app)" : "")
      );

      if (!ok && noProducer) {
        notes.push(
          `${name}: no worker, but nothing enqueues to it either — no work is being lost.`
        );
      } else if (!ok) {
        errors.push(
          `${name}: NO WORKER. Jobs are accepted and never run` +
            (pending > 0 ? ` — ${pending} already waiting in Redis.` : ".")
        );
      }
    }
  } finally {
    // Leaving BullMQ connections open keeps the process alive past the report.
    await Promise.allSettled(queues.map((q) => q.close()));
  }

  console.log("");
  if (notes.length > 0) {
    console.log(`ℹ  ${notes.length} queue${notes.length === 1 ? "" : "s"} idle by design:\n`);
    for (const n of notes) console.log(`   • ${n}\n`);
  }
  if (errors.length > 0) {
    console.error(`❌  ${errors.length} problem${errors.length === 1 ? "" : "s"}:\n`);
    for (const e of errors) console.error(`   • ${e}\n`);
    if (!strict) console.log("Reporting only — pass --strict to fail on these.\n");
  } else {
    console.log("✔  Every queue with a producer has a worker consuming it.\n");
  }

  process.exit(strict && errors.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(
    `\n✖  check:queue-consumers crashed: ${err instanceof Error ? err.message : String(err)}\n`
  );
  process.exit(1);
});
