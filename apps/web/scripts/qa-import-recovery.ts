/** Real import-worker process + real loopback Redis + synthetic PostgREST store.
 * Run from apps/web: NODE_OPTIONS=--conditions=react-server npx tsx scripts/qa-import-recovery.ts
 * No production environment, providers, Docker or new dependencies. Not DB/RLS proof.
 */
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createServer as createSocketServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Queue } from "bullmq";
import { loadImportQueueDiagnostic } from "../src/lib/queues/import-diagnostics";
import { QUEUE_NAMES } from "../src/lib/queue-names";

type Row = Record<string, unknown>;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(check: () => boolean | Promise<boolean>, label: string, timeout = 90_000) {
  const deadline = Date.now() + timeout;
  while (!await check()) {
    if (Date.now() > deadline) throw new Error(`Local recovery timeout: ${label}`);
    await sleep(25);
  }
}
async function stop(child: ChildProcess, signal: NodeJS.Signals = "SIGTERM") {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, "exit");
  child.kill(signal);
  const timer = setTimeout(() => child.kill("SIGKILL"), 4000);
  await exited;
  clearTimeout(timer);
}

async function main() {
  const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  // load-dotenv overrides environment. Refuse an environment-bearing checkout.
  assert(!existsSync(path.join(web, ".env.local")), "Use an isolated worktree without .env.local");
  const directory = await mkdtemp(path.join(tmpdir(), "verkli-import-recovery-"));
  const children: ChildProcess[] = [];
  const store: Record<string, Row[]> = { book_imports: [], books: [], book_versions: [], chapters: [] };
  const events: Array<{ table: string; method: string; importId?: string }> = [];
  const failures: string[] = [];
  let failChapterOnce = false;
  let holdCompletion = false;
  let completionHeld = false;
  let holdVersionAck = false;
  let versionAckHeld = false;
  let workerLogs = "";
  let queue: Queue | undefined;
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url!, "http://127.0.0.1");
      const table = url.pathname.replace(/^\/rest\/v1\//, "");
      assert(table in store, `Unexpected local table: ${table}`);
      const method = request.method!;
      let body = "";
      for await (const chunk of request) body += chunk;
      const values = body ? JSON.parse(body) : null;
      const matches = (row: Row) => [...url.searchParams].every(([key, value]) => {
        if (["select", "order", "limit", "on_conflict", "columns"].includes(key)) return true;
        if (value.startsWith("eq.")) return String(row[key]) === value.slice(3);
        if (value.startsWith("neq.")) return String(row[key]) !== value.slice(4);
        if (value === "not.is.null") return row[key] != null;
        if (value === "is.null") return row[key] == null;
        throw new Error(`Unsupported local filter: ${key}`);
      });
      events.push({ table, method, importId: table === "book_imports" ? url.searchParams.get("id")?.slice(3) : undefined });
      const send = (status: number, data: unknown) => {
        response.writeHead(status, { "content-type": "application/json" });
        response.end(JSON.stringify(data));
      };
      if (table === "chapters" && method === "POST" && failChapterOnce) {
        failChapterOnce = false;
        send(503, { code: "LOCAL_TRANSIENT", message: "Synthetic transient chapter write failure" });
        return;
      }
      if (table === "book_imports" && method === "PATCH" && values.status === "completed" && holdCompletion) {
        completionHeld = true;
        // No completion commit: the parent kills the real worker at this boundary.
        return;
      }
      let result = store[table].filter(matches);
      if (method === "POST") {
        const entries: Row[] = Array.isArray(values) ? values : [values];
        if (table === "book_versions" && entries.some(entry => store[table].some(row => row.id === entry.id))) {
          send(409, { code: "23505", message: "book_versions_pkey" }); return;
        }
        if (table === "book_versions" && entries.some(entry => store[table].some(row => row.book_id === entry.book_id && row.language_code === entry.language_code))) {
          send(409, { code: "23505", message: "book_versions_book_id_language_code_key" }); return;
        }
        result = entries.map(entry => {
          const existing = table === "chapters" && store[table].find(row => row.book_version_id === entry.book_version_id && row.order === entry.order);
          if (existing) {
            if (!String(request.headers.prefer).includes("resolution=ignore-duplicates")) Object.assign(existing, entry);
            return existing;
          }
          const row = { id: randomUUID(), ...(table === "chapters" ? { deleted_at: null } : {}), ...entry };
          store[table].push(row); return row;
        });
      } else if (method === "PATCH") result.forEach(row => Object.assign(row, values));
      else if (method === "DELETE") store[table] = store[table].filter(row => !matches(row));
      else assert(["GET", "HEAD"].includes(method), "Unexpected local method");
      if (table === "book_versions" && method === "POST" && holdVersionAck) {
        versionAckHeld = true; return;
      }
      if (method === "HEAD") { response.writeHead(200, { "content-range": `0-${Math.max(0, result.length - 1)}/${result.length}` }); response.end(); return; }
      const singular = request.headers.accept?.includes("application/vnd.pgrst.object+json");
      if (singular && result.length !== 1) { send(406, { code: "PGRST116", message: "Expected one row" }); return; }
      send(200, singular ? result[0] : result);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : "Local store error");
      response.writeHead(500); response.end("Local contract failure");
    }
  });
  try {
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert(address && typeof address === "object");
    const socket = createSocketServer(); socket.listen(0, "127.0.0.1"); await once(socket, "listening");
    const free = socket.address(); assert(free && typeof free === "object");
    await new Promise<void>(resolve => socket.close(() => resolve()));
    const redis = spawn("redis-server", ["--bind", "127.0.0.1", "--port", String(free.port), "--save", "", "--appendonly", "no", "--dir", directory], { stdio: ["ignore", "pipe", "pipe"] });
    children.push(redis);
    let ready = false;
    redis.stdout!.on("data", chunk => { if (String(chunk).includes("Ready to accept connections")) ready = true; });
    redis.on("error", error => failures.push(error.message));
    await until(() => ready, "owned Redis startup", 5000);
    // Only connect after our Redis confirmed ownership of the loopback port.
    const redisUrl = `redis://127.0.0.1:${free.port}`;
    process.env.REDIS_URL = redisUrl;
    queue = new Queue(QUEUE_NAMES.IMPORT, { connection: { host: "127.0.0.1", port: free.port }, defaultJobOptions: { attempts: 2, backoff: { type: "fixed", delay: 100 } } });
    await queue.waitUntilReady();
    const launch = () => {
      const child = spawn(process.execPath, ["--conditions=react-server", "--import", "tsx", path.join(web, "scripts/import-worker.ts")], {
        cwd: web, stdio: ["ignore", "pipe", "pipe"],
        env: { PATH: process.env.PATH, NODE_ENV: "test", BULLMQ_WORKER: "1",
          SUPABASE_URL: `http://127.0.0.1:${address.port}`, SUPABASE_SERVICE_ROLE_KEY: "local-synthetic-key",
          REDIS_URL: redisUrl, TRANSLATIONS_AUTO_ENQUEUE: "false" },
      });
      children.push(child);
      for (const stream of [child.stdout!, child.stderr!]) stream.on("data", chunk => { workerLogs += String(chunk); });
      child.on("error", error => failures.push(error.message));
      return child;
    };
    const text = "Chapter 1\n\nThe synthetic paper boat floated down the quiet stream. This is a local recovery test.\n";
    const file = path.join(directory, "synthetic.txt"); await writeFile(file, text);
    const seed = () => {
      const importId = randomUUID(), bookId = randomUUID(), authorId = randomUUID();
      store.books.push({ id: bookId, author_id: authorId, title: "Local test", language: "en", original_language: "en" });
      store.book_imports.push({ id: importId, book_id: bookId, author_id: authorId, book_version_id: null, mode: "new_version", status: "pending" });
      return { importId, bookId, authorId, filePath: file, fileStorage: "local", mode: "new_version" };
    };
    let worker = launch();
    if (process.argv.includes("--version-checkpoint-only")) {
      const checkpoint = seed(); holdVersionAck = true;
      await queue.add("extract", checkpoint, { jobId: checkpoint.importId });
      await until(() => versionAckHeld, "version committed before insert acknowledgement");
      const intentBeforeKill = Boolean(store.book_imports.find(row => row.id === checkpoint.importId)?.result);
      const oldPid = worker.pid; await stop(worker, "SIGKILL"); holdVersionAck = false;
      worker = launch(); assert.notEqual(worker.pid, oldPid);
      await until(async () => {
        const job = await queue!.getJob(checkpoint.importId);
        return Boolean(await job?.isCompleted()) || Boolean(await job?.isFailed());
      }, "version acknowledgement restart");
      const diagnostic = await loadImportQueueDiagnostic(checkpoint.importId);
      const versions = store.book_versions.filter(row => row.book_id === checkpoint.bookId).length;
      console.log(JSON.stringify({ scope: "Real worker killed after version commit, before insert acknowledgement; synthetic PostgREST", oldPid, restartedPid: worker.pid, intentBeforeKill, versions, chapters: store.chapters.filter(row => row.book_id === checkpoint.bookId).length, diagnostic, failures }, null, 2));
      assert.equal(diagnostic.state, "completed"); assert.equal(versions, 1); assert(intentBeforeKill);
      assert.deepEqual(failures, []);
      return;
    }
    const retry = seed(); failChapterOnce = true;
    await queue.add("extract", retry, { jobId: retry.importId });
    await until(async () => {
      const job = await queue!.getJob(retry.importId);
      if (await job?.isFailed()) throw new Error(`Retry failed: ${job?.failedReason}; store: ${failures.join(", ")}`);
      return job?.isCompleted() ?? false;
    }, "retry completion");
    const retryVersions = store.book_versions.filter(row => row.book_id === retry.bookId).length;
    const retryDiagnostic = await loadImportQueueDiagnostic(retry.importId);
    assert.equal(retryDiagnostic.attemptsMade, 2);
    if (retryVersions !== 1) failures.push(`Retry created ${retryVersions} versions; expected one`);

    const crash = seed(); holdCompletion = true;
    await queue.add("extract", crash, { jobId: crash.importId });
    await until(() => completionHeld, "chapter commit before completion");
    const before = store.chapters.filter(row => row.book_id === crash.bookId).length; assert(before > 0);
    const oldPid = worker.pid; await stop(worker, "SIGKILL"); holdCompletion = false;
    worker = launch(); assert.notEqual(worker.pid, oldPid);
    await until(async () => (await queue!.getJob(crash.importId))?.isCompleted() ?? false, "real restart recovery");
    const crashVersions = store.book_versions.filter(row => row.book_id === crash.bookId).length;
    const after = store.chapters.filter(row => row.book_id === crash.bookId).length;
    if (crashVersions !== 1 || after !== before) failures.push(`Restart created ${crashVersions} versions and ${after} chapters; expected one version and ${before} chapters`);
    const restartDiagnostic = await loadImportQueueDiagnostic(crash.importId);
    // Remove only this owned completed queue record, then redeliver the same import.
    await (await queue.getJob(crash.importId))!.remove();
    await queue.add("extract", crash, { jobId: crash.importId });
    await until(async () => (await queue!.getJob(crash.importId))?.isCompleted() ?? false, "completed redelivery");
    assert.equal(store.chapters.filter(row => row.book_id === crash.bookId).length, after);

    const terminal = seed(); terminal.filePath = path.join(directory, "missing.txt");
    await queue.add("extract", terminal, { jobId: terminal.importId });
    await until(async () => (await queue!.getJob(terminal.importId))?.isFailed() ?? false, "terminal failure");
    const terminalRow = store.book_imports.find(row => row.id === terminal.importId)!;
    assert.equal(terminalRow.status, "failed"); assert(terminalRow.error_message);
    assert(workerLogs.includes(terminal.importId));
    assert(!workerLogs.includes("The synthetic paper boat"), "Worker leaked manuscript text");
    const terminalDiagnostic = await loadImportQueueDiagnostic(terminal.importId);
    assert.equal(terminalDiagnostic.state, "failed"); assert.equal(terminalDiagnostic.attemptsMade, 2);
    console.log(JSON.stringify({ scope: "Real worker child process, BullMQ and TXT extraction; synthetic HTTP PostgREST store", retry: { versions: retryVersions, diagnostic: retryDiagnostic }, restart: { killedPid: oldPid, restartedPid: worker.pid, versions: crashVersions, chaptersBefore: before, chaptersAfter: after, diagnostic: restartDiagnostic }, terminal: { reference: terminal.importId, diagnostic: terminalDiagnostic, storedError: true }, duplicateRedelivery: "no additional chapters", requestCount: events.length, failures, limitations: "No real Supabase/RLS/transaction or Redis durability proof. Worker default lock/stalled timings retained; no load/capacity claim." }, null, 2));
    assert.deepEqual(failures, []);
  } finally {
    for (const child of children.slice(1).reverse()) await stop(child);
    await queue?.close();
    if (children[0]) await stop(children[0]);
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
}
main().catch(error => { console.error("[local import recovery]", error instanceof Error ? error.message : "failed"); process.exitCode = 1; });
