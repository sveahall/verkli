# Incident Runbook — Production Observability

**Recommended canonical endpoint:** `GET /api/health/workers` — use this as the main health check with an admin session or `x-ops-health-token`. It returns Redis status, queue metrics (depth, failed, active per queue + totals), worker heartbeats (lastSeen, stale/crashed), and the list of crashed queues.

Alert definitions live in `infra/alerting/alerts.yml`. The deprecated endpoints `GET /api/health/metrics/queue` and `GET /api/health/workers/crashes` remain available but return `deprecated: true`; prefer `GET /api/health/workers` for new integrations.

---

## Worker crash recovery

**When:** `GET /api/health/workers` returns one or more queue names in `crashed`, or a worker process is no longer running.

**Symptoms:**
- `crashed` array non-empty
- Jobs stuck in `active` for longer than `stalledInterval`
- No recent logs from the worker

**Steps:**

1. **Confirm the worker is down**
   - Check `GET /api/health/workers`: note which queues are in `crashed` (or use the deprecated `GET /api/health/workers/crashes`).
   - If running in Docker/Kubernetes, check container/pod status and logs.

2. **Restart the worker**
   - **Local / single host:** Restart the canonical runtime with `npm run start-workers`, or restart the targeted single-worker process if only one queue is isolated for debugging.
   - **Docker:** `docker compose restart <worker-service>` or equivalent.
   - **Kubernetes:** `kubectl rollout restart deployment/<worker-deployment>` or delete pod to reschedule.

3. **Verify heartbeat**
   - Within the configured heartbeat interval (default ~30s), call `GET /api/health/workers` again. The restarted queue should no longer appear in `crashed`.
   - Check worker logs for "worker started" and that it is processing jobs.

4. **Stalled jobs**
   - BullMQ will automatically retry jobs that were `active` when the worker died (up to `maxStalledCount`). No manual re-enqueue needed unless jobs have already moved to `failed`. See [Queue backlog recovery](#queue-backlog-recovery) if you need to re-enqueue failed jobs.

5. **If crashes recur**
   - Check memory (OOM), CPU, and Redis connectivity. Consider reducing `concurrency` or increasing resources. See `docs/workers-runbook.md` for stall and retry behaviour.

---

## Queue backlog recovery

**When:** Queue lag is high (`totals.queueDepth` or per-queue `queueDepth` above threshold) or failed jobs are high (`totals.failedJobs` or per-queue `failedJobs`).

**Symptoms:**
- `GET /api/health/workers` shows large `queueMetrics.totals.queueDepth` or `queueMetrics.totals.failedJobs`, or high per-queue values in `queueMetrics.queues`.
- Users report slow or stuck imports, translations, or audiobook generation.

**Steps:**

1. **Assess**
   - Call `GET /api/health/workers`. Note which queues have high `queueMetrics.queues[].queueDepth` or `queueMetrics.queues[].failedJobs`.
   - If workers for those queues are in `crashed`, fix worker crash first (see [Worker crash recovery](#worker-crash-recovery)).

2. **Scale or speed up consumption**
   - Ensure all workers for the affected queues are running and healthy.
   - If acceptable for your deployment: temporarily increase worker concurrency or add more worker instances (if supported). Do not exceed Redis or downstream service limits.

3. **Investigate failed jobs**
   - Check application logs for the failing queue (e.g. `[import worker] job failed`, `BudgetExceededError`, `UnrecoverableError`).
   - **BudgetExceededError:** The user/pipeline exhausted its daily allowance. See [AI budget breach](#ai-budget-breach). Jobs will not succeed until the next UTC day or an approved limit change.
   - **UnrecoverableError:** Bad input or auth; job will not retry. Fix data or re-enqueue a corrected job via the API (e.g. re-trigger import or translation from the app).
   - **Transient errors:** Failed jobs may be retried automatically (BullMQ `attempts`). If jobs are already in `failed` and should be retried, re-trigger the operation from the API (e.g. re-upload, re-request translation/audiobook).

4. **Drain or pause (optional)**
   - If you need to stop accepting new work temporarily, disable or rate-limit the API routes that enqueue jobs. Existing queued jobs will still be processed by running workers.
   - Preserve queue/job state. Use BullMQ's supported pause/recovery operations through the release operator; do not delete Redis wait/active sets or job hashes directly. See `docs/workers-runbook.md`.

5. **Monitor**
   - Watch `queueMetrics.totals.queueDepth` and `queueMetrics.totals.failedJobs` (or per-queue in `queueMetrics.queues`) until they return to normal. Alerting should fire if thresholds are exceeded (see `infra/alerting/alerts.yml`).

---

## Redis outage handling

**When:** `GET /api/health/workers` returns `redis.connected: false` or HTTP 503.

**Symptoms:**
- Inspect `redis.connected` and `queueDepths`: a null queue depth indicates a failed read; consult service logs for the error. Aggregate metrics may still show zero, which is not proof of an empty queue.
- Workers cannot connect to Redis; logs show connection timeouts or "Redis not reachable".
- Enqueue operations fail; jobs are not processed.

**Steps:**

1. **Confirm Redis is down**
   - From a host that can reach Redis: `redis-cli -u $REDIS_URL ping`. If no PONG, Redis is unreachable or down.
   - Check Redis server process, network, and firewall. If managed (e.g. ElastiCache, Redis Cloud), check provider status and your VPC/security groups.

2. **Restore Redis**
   - **Self-hosted:** Restart Redis (e.g. `systemctl restart redis`, `docker compose restart redis`). If persistence is enabled, data should be restored from RDB/AOF.
   - **Managed:** Follow provider’s runbook; restore from backup if needed.

3. **Verify connectivity**
   - `redis-cli -u $REDIS_URL ping` → PONG.
   - Call `GET /api/health/workers` again; `redis.connected` should be true and queue metrics should load.

4. **Workers**
   - Workers that lost connection will have exited or be in a bad state. Restart all workers (see [Worker crash recovery](#worker-crash-recovery)) so they reconnect and resume processing.

5. **Queue state**
   - If Redis was restarted without persistence or after a long outage, queue state may be lost. New jobs can be enqueued; in-flight jobs may need to be re-triggered from the application (e.g. user retries import/translation/audiobook).

---

## AI budget breach

**When:** A user/pipeline exhausts its daily allowance, configuration is missing, or provider usage/cost increases unexpectedly.

**Symptoms:**
- Translation or audiobook jobs fail with `BudgetExceededError`, or editorial/marketing reports `BudgetConfigurationError` before invoking a provider.
   - `GET /api/health/workers` may show elevated `queueMetrics.queues["book-translation"].failedJobs` or `queueMetrics.queues["audiobook-generation"].failedJobs`.
- Unusual cost or usage on OpenAI/Anthropic (or other provider) dashboard.

**Steps:**

1. **Confirm budget breach**
   - Check the feature-prefixed error, pipeline, job ID, UTC day and configured limit. Keep user IDs and manuscript text out of shared incident reports.
   - The shared guard uses atomic Redis reservations per user/pipeline/UTC day (`apps/web/src/lib/workers/budget.ts`). Restarting a worker does not reset them.

2. **Immediate mitigation**
   - **Expected limit:** Wait until the next UTC day or obtain an approved limit change. Use the actual pipeline environment variables in the [worker budget table](./workers-runbook.md#5-budget-tracking); the shared guard has no monthly or global monetary cap.
   - **Missing configuration:** Set the required approved editorial/marketing limits consistently on web and worker services. Do not fall back to an invented allowance.
   - **Runaway usage:** If one key is consuming far more than intended, consider temporarily blocking that key in application logic or disabling the feature for that user until investigated.

3. **Cost spike (no single user breach)**
   - Correlate with queue depth and failed job rate. High volume of legitimate requests will increase cost.
   - Check provider dashboard for rate limits or errors. Scale workers or concurrency only if Redis and downstream services can handle it; otherwise use rate limiting or backpressure at the API.

4. **Production note**
   - Counters are already shared in Redis. Inspect provider billing separately: reservation units are not currency, and a retry can invoke a provider again. Never clear reservation keys to bypass a limit.

5. **Document**
   - Note the key, limit, and time window. Update runbook or alerting if you change thresholds or add new limits.

---

## Quick reference

| Endpoint | Purpose |
|----------|---------|
| **`GET /api/health/workers`** | **Canonical:** Redis, queue metrics (depth, failed, active per queue + totals), heartbeats (lastSeen, stale/crashed), crashed list |
| `GET /api/health/metrics/queue` | Queue metrics only (deprecated; use `/api/health/workers`) |
| `GET /api/health/workers/crashes` | Heartbeats and crashed list only (deprecated; use `/api/health/workers`) |

HTTP 200 from the canonical endpoint does not mean every worker is healthy. Inspect null `queueDepths` entries, service logs, stale/crashed heartbeats and expected worker presence. Record a job ID and its verified output for each end-to-end smoke test.

Heartbeat thresholds (env): `HEARTBEAT_INTERVAL_MS` (default 30000), `HEARTBEAT_STALE_MS` (default 180000). See `apps/web/src/lib/health/worker-heartbeat.ts`.

## Backup and restore evidence

No restore drill is certified by this runbook. Before a launch owner marks recovery ready, record the actual backup timestamp and retention, database **and Storage object** coverage, an isolated restore destination, and the operator. A database snapshot or Storage metadata listing alone does not prove recovery of manuscript/cover/audio bytes.

Restore only into the agreed isolated destination. Capture row counts and selected content hashes, a restored object's byte hash, access-control checks for two distinct test users, and a read/listen check on designated test content. Record elapsed recovery time and the data gap since the snapshot. Keep backup archives and credentials private; retain only redacted evidence in the release report. Do not restore over production to conduct this drill.

Alert definitions: `infra/alerting/alerts.yml`.  
Worker operations: `docs/workers-runbook.md`, `docs/workers-local.md`.
