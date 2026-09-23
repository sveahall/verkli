/** Local transport only: owns loopback Redis, synthetic jobs, no database/providers.
 * NODE_OPTIONS=--conditions=react-server npx tsx scripts/qa-import-queue.ts
 */
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { Queue, Worker } from "bullmq";
import { loadImportQueueDiagnostic } from "../src/lib/queues/import-diagnostics";
import { QUEUE_NAMES } from "../src/lib/queue-names";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check: () => Promise<boolean>, ms = 15000) {
  const deadline = Date.now() + ms;
  while (!(await check())) { if (Date.now() > deadline) throw new Error("Local queue drill timed out"); await sleep(25); }
}
async function main() {
  if (process.argv[2] === "--local-worker") {
    const port = Number(process.argv[3]);
    assert(Number.isInteger(port) && port > 1024 && port <= 65535);
    const worker = new Worker(QUEUE_NAMES.IMPORT, async (job) => {
      if (process.argv[4] === "crash") { process.send?.("active"); await new Promise(() => {}); }
      if (job.data.failAlways || (job.data.failOnce && job.attemptsMade === 0)) throw new Error("Synthetic transient failure");
      await sleep(25); return { importId: job.id, synthetic: true };
    }, { connection: { host: "127.0.0.1", port }, concurrency: 2, lockDuration: 1000, stalledInterval: 500, maxStalledCount: 2 });
    worker.on("error", () => { process.exitCode = 1; });
    await worker.waitUntilReady(); process.send?.("ready");
    process.on("SIGTERM", () => { void worker.close().then(() => process.exit(0)); });
    return;
  }
  const directory = await mkdtemp(path.join(tmpdir(), "verkli-queue-drill-"));
  const server = createServer(); server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert(address && typeof address === "object");
  const port = address.port; await new Promise<void>((resolve) => server.close(() => resolve()));
  const redis = spawn("redis-server", ["--bind", "127.0.0.1", "--port", String(port), "--save", "", "--appendonly", "no", "--dir", directory], { stdio: ["ignore", "pipe", "ignore"] });
  // Do not create a queue unless OUR Redis owns the port (no port-race fallback).
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { redis.kill("SIGTERM"); reject(new Error("Local Redis did not start")); }, 5000);
    redis.on("error", () => { clearTimeout(timer); reject(new Error("redis-server is required locally")); });
    redis.on("exit", () => { clearTimeout(timer); reject(new Error("Local Redis exited")); });
    redis.stdout!.on("data", (data: Buffer) => { if (data.toString().includes("Ready to accept connections")) { clearTimeout(timer); resolve(); } });
  }).catch(async (error) => { await rm(directory, { recursive: true, force: true }); throw error; });
  const children: ChildProcess[] = [];
  const queue = new Queue(QUEUE_NAMES.IMPORT, { connection: { host: "127.0.0.1", port, maxRetriesPerRequest: 1 }, defaultJobOptions: { attempts: 2, backoff: { type: "fixed", delay: 50 } } });
  queue.on("error", () => {});
  process.env.REDIS_URL = `redis://127.0.0.1:${port}`;
  const launch = async (mode = "normal") => {
    const child = spawn(process.execPath, [...process.execArgv, fileURLToPath(import.meta.url), "--local-worker", String(port), mode], { stdio: ["ignore", "ignore", "inherit", "ipc"] });
    children.push(child);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Local worker did not start")), 10000);
      child.on("message", (message) => { if (message === "ready") { clearTimeout(timer); resolve(); } });
      child.on("error", (error) => { clearTimeout(timer); reject(error); });
    });
    return child;
  };
  try {
    await queue.waitUntilReady();
    const restartId = randomUUID(); const crashWorker = await launch("crash");
    await queue.add("extract", { synthetic: true }, { jobId: restartId });
    await until(async () => (await queue.getJob(restartId))?.isActive() ?? false);
    assert.equal((await loadImportQueueDiagnostic(restartId)).state, "active");
    const killed = once(crashWorker, "exit"); crashWorker.kill("SIGKILL"); await killed;
    const restartAt = Date.now(); await launch();
    await until(async () => (await queue.getJob(restartId))?.isCompleted() ?? false);
    const recoveryMs = Date.now() - restartAt;
    assert.equal((await loadImportQueueDiagnostic(restartId)).state, "completed");
    const retryId = randomUUID(); const failureId = randomUUID();
    await queue.add("extract", { failOnce: true }, { jobId: retryId });
    await queue.add("extract", { failAlways: true }, { jobId: failureId });
    await until(async () => Boolean(await (await queue.getJob(retryId))?.isCompleted()) && Boolean(await (await queue.getJob(failureId))?.isFailed()));
    assert.equal((await queue.getJob(retryId))?.attemptsMade, 2);
    assert.equal((await queue.getJob(failureId))?.attemptsMade, 2);
    const countBeforeDuplicate = await queue.count();
    await queue.add("extract", { failOnce: true }, { jobId: retryId });
    assert.equal(await queue.count(), countBeforeDuplicate);
    assert.equal((await queue.getJob(retryId))?.attemptsMade, 2);
    const loadIds = Array.from({ length: 40 }, () => randomUUID()); const started = Date.now();
    await queue.addBulk(loadIds.map((jobId) => ({ name: "extract", data: { synthetic: true }, opts: { jobId } })));
    await until(async () => (await queue.getCompletedCount()) === 42);
    const elapsedMs = Date.now() - started;
    const jobs = await Promise.all(loadIds.map((id) => queue.getJob(id)));
    const percentile = (values: number[], fraction: number) => values.sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1];
    const waits = jobs.map((job) => job!.processedOn! - job!.timestamp);
    const processing = jobs.map((job) => job!.finishedOn! - job!.processedOn!);
    assert.equal(new Set(jobs.map((job) => job!.id)).size, 40);
    console.log(JSON.stringify({ scope: "Synthetic local BullMQ transport; no manuscript, database or providers", node: process.version,
      workload: { jobs: 40, concurrency: 2, simulatedWorkMs: 25 }, elapsedMs, jobsPerSecond: Number((40000 / elapsedMs).toFixed(2)),
      waitMs: { p50: percentile(waits, 0.5), p95: percentile(waits, 0.95) }, processMs: { p50: percentile(processing, 0.5), p95: percentile(processing, 0.95) },
      retry: { attempts: 2, sameId: true, duplicateEnqueueCreatedJobs: 0 }, terminalFailure: { attempts: 2, state: "failed" },
      restart: { recoveryMs, lockDurationMs: 1000, stalledIntervalMs: 500, sameId: true }, counts: await queue.getJobCounts("completed", "failed", "waiting", "active"),
      limitation: "Compressed lock timing. Does not prove production capacity, manuscript restore, or exactly-once database effects." }, null, 2));
  } finally {
    for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
    await Promise.all(children.map(async (child) => { if (child.exitCode === null && child.signalCode === null) await Promise.race([once(child, "exit"), sleep(3000).then(() => { child.kill("SIGKILL"); })]); }));
    await queue.close().catch(() => {});
    const stopped = once(redis, "exit"); redis.kill("SIGTERM"); await stopped;
    const outageAt = Date.now();
    assert.equal((await loadImportQueueDiagnostic(randomUUID())).availability, "unavailable");
    const outageResponseMs = Date.now() - outageAt;
    assert(outageResponseMs < 5000, "Unavailable Redis diagnostic exceeded 5 seconds");
    console.log(JSON.stringify({ outageDiagnostic: "unavailable", outageResponseMs }));
    await rm(directory, { recursive: true, force: true });
  }
}
main().catch((error) => { console.error("[local queue drill]", error instanceof Error ? error.message : "failed"); process.exitCode = 1; });
