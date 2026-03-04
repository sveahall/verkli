# Incident Runbook — Production Observability

**Recommended canonical endpoint:** `GET /api/health/workers` — use this as the main health check. It returns Redis status, queue metrics (depth, failed, active per queue + totals), worker heartbeats (lastSeen, stale/crashed), and the list of crashed queues.

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
   - **Local / single host:** Restart the process (e.g. `npm run import-worker`, or your process manager).
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
   - **BudgetExceededError:** User hit daily/monthly token limit. See [AI budget breach](#ai-budget-breach). Jobs will not succeed until reset or limit change.
   - **UnrecoverableError:** Bad input or auth; job will not retry. Fix data or re-enqueue a corrected job via the API (e.g. re-trigger import or translation from the app).
   - **Transient errors:** Failed jobs may be retried automatically (BullMQ `attempts`). If jobs are already in `failed` and should be retried, re-trigger the operation from the API (e.g. re-upload, re-request translation/audiobook).

4. **Drain or pause (optional)**
   - If you need to stop accepting new work temporarily, disable or rate-limit the API routes that enqueue jobs. Existing queued jobs will still be processed by running workers.
   - Emergency drain: see `docs/workers-runbook.md` (e.g. Redis DEL of wait/active sets). Use only when you understand the impact.

5. **Monitor**
   - Watch `queueMetrics.totals.queueDepth` and `queueMetrics.totals.failedJobs` (or per-queue in `queueMetrics.queues`) until they return to normal. Alerting should fire if thresholds are exceeded (see `infra/alerting/alerts.yml`).

---

## Redis outage handling

**When:** `GET /api/health/workers` returns `redis: false` or HTTP 503.

**Symptoms:**
- All queue metrics show zeros or errors; `redis` is false.
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

**When:** Users hit daily or monthly token limits; jobs fail with `BudgetExceededError`; or you see an unexpected spike in AI usage/cost.

**Symptoms:**
- Translation or audiobook jobs failing; logs show `BudgetExceededError` and message like "Budget exceeded for … daily usage X >= limit Y".
   - `GET /api/health/workers` may show elevated `queueMetrics.queues["book-translation"].failedJobs` or `queueMetrics.queues["audiobook-generation"].failedJobs`.
- Unusual cost or usage on OpenAI/Anthropic (or other provider) dashboard.

**Steps:**

1. **Confirm budget breach**
   - Check logs for `BudgetExceededError` and the key (e.g. userId/authorId) and period (daily/monthly).
   - Budget is enforced in-memory per worker (see `apps/web/src/lib/workers/budget.ts`). Restarting a worker resets its in-memory counters; limits are per key per day/month.

2. **Immediate mitigation**
   - **Expected limit:** Limits are in place to control cost. Users must wait until daily (midnight UTC) or monthly rollover, or you can increase limits via env `AI_BUDGET_DAILY_TOKENS` / `AI_BUDGET_MONTHLY_TOKENS` and restart workers.
   - **Runaway usage:** If one key is consuming far more than intended, consider temporarily blocking that key in application logic or disabling the feature for that user until investigated.

3. **Cost spike (no single user breach)**
   - Correlate with queue depth and failed job rate. High volume of legitimate requests will increase cost.
   - Check provider dashboard for rate limits or errors. Scale workers or concurrency only if Redis and downstream services can handle it; otherwise use rate limiting or backpressure at the API.

4. **Production note**
   - Budget counters are currently in-memory per process. For multi-instance production, migrate to Redis-backed counters (e.g. `budget:{userId}:{YYYY-MM-DD}` with TTL) as noted in `budget.ts` and `docs/workers-runbook.md`.

5. **Document**
   - Note the key, limit, and time window. Update runbook or alerting if you change thresholds or add new limits.

---

## Quick reference

| Endpoint | Purpose |
|----------|---------|
| **`GET /api/health/workers`** | **Canonical:** Redis, queue metrics (depth, failed, active per queue + totals), heartbeats (lastSeen, stale/crashed), crashed list |
| `GET /api/health/metrics/queue` | Queue metrics only (deprecated; use `/api/health/workers`) |
| `GET /api/health/workers/crashes` | Heartbeats and crashed list only (deprecated; use `/api/health/workers`) |

Heartbeat thresholds (env): `HEARTBEAT_INTERVAL_MS` (default 30000), `HEARTBEAT_STALE_MS` (default 180000). See `apps/web/src/lib/health/worker-heartbeat.ts`.

Alert definitions: `infra/alerting/alerts.yml`.  
Worker operations: `docs/workers-runbook.md`, `docs/workers-local.md`.
