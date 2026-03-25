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

All workers read from `apps/web/.env.local`:

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

From repo root:

```bash
npm run start-workers      # canonical unified runtime

# or start a single worker when debugging one queue
npm run import-worker      # book-import-extract queue
npm run translate-worker   # book-translation queue
npm run audiobook-worker   # audiobook-generation queue
```

Additional single-worker scripts are available for `marketing`, `social-publish`,
`recommendations`, and `notifications`.

The canonical production path is the unified runtime in
`apps/web/scripts/start-workers.ts`; single-worker scripts are primarily for
local isolation and debugging.

## 4. Worker Hardening Config (Beta)

| Worker | Concurrency | stalledInterval | lockDuration | maxStalledCount | Retries | Backoff |
|--------|------------|-----------------|--------------|-----------------|---------|---------|
| Import | 3 | 30s | default | 2 | 2 | 2s exp |
| Translation | 2 | 30s | default | 2 | 3 | 5s exp |
| Audiobook | 2 | 120s | 600s | 2 | 3 | 10s exp |

### Safety features per worker

- **All workers**: Idempotent job IDs at enqueue, processor-level dedupe before work
- **Translation**: Budget gate (100k tokens/day, 3M/month per user), `UnrecoverableError` for bad input
- **Audiobook**: Budget gate, hard timeout (5min/chapter), `UnrecoverableError` for auth failures

## 5. Budget Tracking

Budget counters are **in-memory per process**. Restarting a worker resets counters.
This is acceptable for Beta (single-instance). For production, migrate to Redis INCRBY
with TTL-based keys (see `src/lib/workers/budget.ts` header comment).

Defaults: 100 000 tokens/day, 3 000 000 tokens/month per userId.

## 6. Stalled Jobs — How It Works

A job is **stalled** when the worker stops sending heartbeats to Redis. BullMQ checks
every `stalledInterval` ms. If a job has no heartbeat, it is marked stalled.

**`maxStalledCount`** controls how many times a job can stall before it moves to `failed`:

```
Job starts → worker crashes → no heartbeat for stalledInterval
  → BullMQ marks job stalled (stall count = 1)
  → If stall count <= maxStalledCount: job is retried automatically
  → If stall count > maxStalledCount: job moves to failed permanently
```

| Worker | stalledInterval | maxStalledCount | Meaning |
|--------|----------------|-----------------|---------|
| Import | 30s | 2 | Retried up to 2x after 30s silence |
| Translation | 30s | 2 | Same |
| Audiobook | 120s | 2 | Retried up to 2x after 2min silence (longer because TTS is slow) |

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
| Jobs stuck in `active` | Worker crashed mid-job | Restart worker. BullMQ auto-retries after `stalledInterval` |
| Jobs move to `failed` after stall | `maxStalledCount` exceeded | Check worker logs for OOM/crash. Increase memory or reduce concurrency |
| Audiobook job stalls after 5min | Chapter TTS timeout | Check TTS binary. Reduce chapter length or increase timeout |
| `BudgetExceededError` in logs | User hit daily/monthly limit | Wait for reset (midnight UTC / month rollover) or restart worker to clear in-memory counters |
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

### Clear a single hung job

```bash
redis-cli -u $REDIS_URL

# 1. Find the job ID (from logs or DB ai_jobs table)
# 2. Remove it from the active set
LREM bull:audiobook-generation:active 0 {job-id}

# 3. Delete the job hash
DEL bull:audiobook-generation:{job-id}

# 4. Optionally move it to failed for tracking
# (or just delete — it won't be retried)
```

Alternatively, re-deploy the worker. On startup BullMQ reclaims orphaned active
jobs and processes them through the stall mechanism normally.

### Drain a queue (emergency)

```bash
redis-cli -u $REDIS_URL
DEL bull:book-import-extract:wait bull:book-import-extract:active
# Repeat for other queues as needed
```

## 7. Monitoring

Worker health is exposed at `GET /api/health/queue`. Returns Redis connectivity and queue sizes.
