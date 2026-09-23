# Workers Runbook (Beta)

Operational guide for BullMQ workers. For basic start commands see [workers-local.md](./workers-local.md).

## 1. Start Redis

```bash
# Docker (recommended for local dev)
docker compose up -d

# Verify
redis-cli -u redis://localhost:6379 ping
# → PONG
```

## 2. Required Environment Variables

Local workers load `apps/web/.env.local`; production receives its environment from the deployment service. Never copy credentials into logs or this document.

| Variable | Required by | Notes |
|----------|------------|-------|
| `REDIS_URL` | All workers | e.g. `redis://localhost:6379` |
| `SUPABASE_SERVICE_ROLE_KEY` | All workers | Service role key (bypasses RLS) |
| `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_URL` | All workers | At least one must be set |
| `OPUSMT_PYTHON` | Translation worker | Path to Python with CTranslate2 |
| `OPUSMT_MODELS_DIR` | Translation worker | Path to Opus MT model files |
| `AUDIOBOOK_STORAGE_BUCKET` | Audiobook worker | Supabase storage bucket name |
| `FFMPEG_BIN` | Audiobook worker | Optional, defaults to `ffmpeg` in PATH |

## 3. Start Workers

Production runs one worker per Railway service; see the dated inventory in
[railway-deployment.md](./railway-deployment.md). Restart or deploy the intended
service only. From repo root, isolate a queue locally with:

```bash
npm run import-worker      # book-import-extract queue
npm run translate-worker   # book-translation queue
npm run audiobook-worker   # audiobook-generation queue
```

Additional single-worker scripts are available for `marketing`, `social-publish`,
`recommendations`, and `notifications`.

`npm run start-workers` imports all seven consumers unconditionally. It can
start paid marketing generation and external social publishing, including
already queued work; it also duplicates consumers if the separate services are
running. Do not use it as a production health repair. A currently empty queue
does not make starting an additional consumer a read-only operation.

## 4. Worker Hardening Config (Beta)

| Worker | Concurrency | stalledInterval | lockDuration | maxStalledCount | Retries | Backoff |
|--------|------------|-----------------|--------------|-----------------|---------|---------|
| Import | 3 | 30s | default | 2 | 2 | 2s exp |
| Translation | 2 | 30s | default | 2 | 3 | 5s exp |
| Audiobook | 1 by default (`TTS_CONCURRENCY`, bounded 1–4) | 120s | 3,660s | 2 | 3 | 10s exp |

### Safety features per worker

- **All workers**: Idempotent job IDs at enqueue, processor-level dedupe before work
- **Translation**: Redis daily budget and per-job size cap, `UnrecoverableError` for bad input
- **Audiobook**: Redis daily budget, per-job size cap and bounded chapter timeout (`TTS_TIMEOUT_MS`), `UnrecoverableError` for auth failures

## 5. Budget Tracking

The shared guard in `apps/web/src/lib/workers/budget.ts` reserves units atomically in Redis per user, pipeline and UTC day. Restarting a worker does **not** reset usage. The next UTC day uses a new key; old keys live one extra hour for diagnosis. A stable job reservation marker prevents charging that same reservation twice on retry. Actual provider retries can still cost money; the caller must reserve all intended calls appropriately.

| Pipeline | Daily allowance | Per-job cap |
|----------|-----------------|-------------|
| Translation | `TRANSLATION_DAILY_BUDGET` (default 500,000 units) | `TRANSLATION_JOB_CAP_CHARS` (default 1,000,000 characters) |
| TTS | `TTS_DAILY_BUDGET` (default 500,000 units) | `TTS_JOB_CAP_CHARS` (default 50,000 characters) |
| Video | `VIDEO_DAILY_BUDGET` (default 100 units) | `VIDEO_JOB_CAP_UNITS` (default 5) |
| Editorial review | `EDITORIAL_DAILY_BUDGET`, explicit positive safe integer required | Editorial request/size validation also applies |
| Marketing | `MARKETING_DAILY_BUDGET`, explicit positive safe integer required | `MARKETING_JOB_CAP_UNITS`, explicit positive safe integer required |

These are technical units selected by callers, **not SEK, invoices, a monthly budget or a platform-wide spending ceiling**. Editorial/marketing use conservative token bounds. Missing editorial/marketing configuration fails closed. Redis must be reachable; do not bypass the guard or delete budget keys to make a failed job run. Set approved limits consistently on web and worker services before enabling those features. Provider limits, concurrency and actual usage require separate monitoring.

Editorial review and single marketing drafts run synchronously in the web
service. Editorial has no separate worker. Campaign generation additionally
requires the marketing consumer and its budget configuration. Budget limits
apply per user, pipeline and UTC day, so enabling an allowance in production
affects every eligible user rather than one internal test account.

## 6. Stalled Jobs — How It Works

A job becomes eligible for **stalled** recovery when its BullMQ job lock is missing or expires. BullMQ checks periodically using `stalledInterval`; the separate health heartbeat is not that job lock. Lock expiry and the next stalled check both affect recovery time.

**`maxStalledCount`** controls how many times a job can stall before it moves to `failed`:

```
Job starts → worker crashes → its job lock expires → a stalled check detects it
  → BullMQ marks job stalled (stall count = 1)
  → If stall count <= maxStalledCount: job is retried automatically
  → If stall count > maxStalledCount: job moves to failed permanently
```

| Worker | stalledInterval | maxStalledCount | Meaning |
|--------|----------------|-----------------|---------|
| Import | 30s | 2 | Periodic check; recovery also waits for lock expiry |
| Translation | 30s | 2 | Periodic check; recovery also waits for lock expiry |
| Audiobook | 120s | 2 | Periodic check with a 3,660s job lock; not a promise of recovery in two minutes |

This is separate from `attempts` (retry on thrown errors). A job can exhaust both
stall retries AND error retries independently.

### Check for stalled jobs

```bash
# Connect to Redis and inspect the queue
redis-cli -u $REDIS_URL

# List stalled jobs for import queue
SMEMBERS bull:book-import-extract:stalled

# List stalled jobs for audiobook queue
SMEMBERS bull:audiobook-generation:stalled

# Check a specific job's data
HGETALL bull:book-import-extract:{job-id}
```

### Common causes and fixes

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Jobs stuck in `active` | Worker crashed mid-job | Restart worker. BullMQ recovery requires the old lock to expire and a subsequent stalled check |
| Jobs move to `failed` after stall | `maxStalledCount` exceeded | Check worker logs for OOM/crash. Increase memory or reduce concurrency |
| Audiobook generation times out | Bounded chapter TTS timeout | Check provider/worker logs and chapter size before changing the approved timeout |
| `BudgetExceededError` in logs | User/pipeline daily allowance exhausted | Wait until the next UTC day or obtain an approved allowance change; restart does not clear Redis usage |
| `BudgetConfigurationError` in logs | Required editorial/marketing allowance missing or invalid | Configure the named positive integer on the service that makes the reservation |
| `UnrecoverableError` in logs | Bad input data (wrong book ID, auth mismatch) | Job will NOT retry. Fix the input data and re-enqueue |

### Manually re-enqueue a failed job

There is no CLI for this yet. Re-trigger from the API:

```bash
# Re-trigger import
curl -X POST http://localhost:3000/api/books/import -F file=@book.epub

# Re-trigger translation
curl -X POST http://localhost:3000/api/books/{bookId}/translate \
  -H "Content-Type: application/json" \
  -d '{"targetLanguage":"en"}'
```

### Recover a single hung job or stop new work

Record the job ID, queue state, matching `ai_jobs` status, reservation and error first. Check whether its worker still holds the lock. Restart a failed worker and allow BullMQ's configured stall recovery to run; do not edit the `active`/`wait` lists or delete a job hash directly. These keys form a coordinated data structure, and deleting only some of them can orphan work and lose its recovery evidence.

Before a terminal job is retried, verify whether it already wrote chapters or audio and whether it owns the current database claim. Use the application's explicit retry action once that state is understood. A new job ID may reserve a new allowance and invoke a paid provider again.

For an incident, stop new submissions through the appropriate feature control, retain queue/job data, and have the release operator pause or recover the specific queue using BullMQ's supported operations. Changing concurrency, deleting jobs, or clearing budgets is not a routine recovery step.

## 7. Monitoring

Use `GET /api/health/workers` with an admin session or the configured `x-ops-health-token`. Inspect `redis.connected`, `queueDepths`, `heartbeats` and `crashed`; `queueDepths[name]=null` means that queue could not be read (inspect service logs). The aggregate metrics can still contain zeros in that case. HTTP 200 alone only establishes Redis availability here, not successful jobs. The public `/api/health` only proves the web process/version. A completed import/translation/audio journey needs its own job and output evidence. See [INCIDENT_RUNBOOK.md](./INCIDENT_RUNBOOK.md).

The notifications queue currently has no producer (`scripts/check-queue-consumers.ts`,
`NO_PRODUCER`). Follow/comment notifications are inserted directly by
`src/lib/notifications/server.ts`; starting the queue consumer does not verify
that path or deliver email/push. Assess intentionally inactive queues separately
from a missing consumer for an enabled feature.
