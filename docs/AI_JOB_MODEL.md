# AI Job Model

Canonical contract for all asynchronous work in Verkli.

## Status quo

Job status is currently spread across four tables with inconsistent status
values:

| Table | Statuses | Queue |
|---|---|---|
| `ai_jobs` | pending, processing, completed, failed, cancelled | BullMQ |
| `book_imports` | pending, extracting, completed, failed | BullMQ |
| `book_versions` | draft, translating, done, failed | BullMQ |
| `tts_preview_jobs` | queued, running, succeeded, failed | Table polling |

A normalisation layer (`lib/job-status.ts`) and a read-only view
(`job_status_view`) paper over the differences today. This document defines the
target model that all new job types **must** follow and that existing tables will
migrate toward.

---

## Canonical schema: `ai_jobs`

```
id              uuid        PK, default gen_random_uuid()
type            text        NOT NULL — job kind (e.g. "audiobook", "import", "translation")
status          text        NOT NULL DEFAULT 'queued'
progress        integer     NOT NULL DEFAULT 0, CHECK (0..100)
payload         jsonb       NOT NULL DEFAULT '{}'  — input parameters
result          jsonb       — output data (nullable until succeeded)
error           text        — human-readable error (nullable)
retries         integer     NOT NULL DEFAULT 0
user_id         uuid        NOT NULL, FK → auth.users
book_id         uuid        FK → books (nullable)
book_version_id uuid        FK → book_versions (nullable)
language        text        (nullable)
created_at      timestamptz NOT NULL DEFAULT now()
updated_at      timestamptz NOT NULL DEFAULT now()
started_at      timestamptz
finished_at     timestamptz
```

### Column notes

| Column | Purpose |
|---|---|
| `type` | Replaces the current `kind` column. One value per queue job name. |
| `payload` | Replaces the current `input` column. Immutable after creation. |
| `result` | Replaces the current `output` column. Written by the worker on success. |
| `retries` | Incremented by the worker on each attempt. Enables retry-aware logic. |
| `progress` | Integer 0–100. Workers update this during `running`. |

---

## Lifecycle states

```
           ┌──────────┐
           │  queued   │ ← job created
           └────┬─────┘
                │  worker picks up
                ▼
           ┌──────────┐
     ┌─────│  running  │─────┐
     │     └────┬─────┘      │
     │          │             │
     │   success│        fail │ (retries < max)
     │          │             │
     │          ▼             ▼
     │  ┌───────────┐  ┌──────────┐
     │  │ succeeded │  │  queued   │ ← re-queued for retry
     │  └───────────┘  └──────────┘
     │
     │  fail (retries >= max)
     │          │
     │          ▼
     │  ┌──────────┐
     │  │  failed   │
     │  └──────────┘
     │
     │  user/system cancel
     │          │
     │          ▼
     │  ┌───────────┐
     └─►│ cancelled │
        └───────────┘
```

### State definitions

| Status | Meaning |
|---|---|
| `queued` | Job is waiting for a worker. No processing has started. |
| `running` | A worker has claimed the job and is actively processing. |
| `succeeded` | Work completed. `result` is populated. `finished_at` is set. |
| `failed` | Work failed after exhausting all retries. `error` is populated. `finished_at` is set. |
| `cancelled` | Cancelled by user or system. `finished_at` is set. No further processing. |

### Allowed transitions

```
queued     → running
queued     → cancelled
running    → succeeded
running    → failed
running    → queued      (retry)
running    → cancelled
```

No other transitions are valid. Terminal states (`succeeded`, `failed`,
`cancelled`) are permanent — a new job must be created to retry after terminal
failure.

---

## Retry semantics

### Rules

1. **Max retries** are defined per queue in `queues/descriptors.ts`.
2. **Backoff** is exponential: `delay = backoffDelayMs * 2^(attempt - 1)`.
3. The worker increments `retries` before each re-attempt.
4. When `retries >= maxAttempts`, the job transitions to `failed`.
5. The `error` column stores the error from the **last** attempt.

### Current retry policies

| Queue | Max attempts | Initial backoff |
|---|---|---|
| import | 2 | 2 s |
| translation | 3 | 5 s |
| audiobook | 3 | 10 s |
| social-publish | 2 | 5 s |
| recommendations | 2 | 5 s |
| marketing | 2 | 5 s |

### Non-retryable errors

Some failures should **not** be retried:

- Validation errors (bad payload)
- Authentication / authorisation failures
- Resource not found (book deleted during processing)
- User-initiated cancellation

Workers must distinguish retryable from non-retryable errors and skip to
`failed` immediately for non-retryable cases.

---

## Idempotency

### Job creation

Every job must have a **deduplication key** derived from its inputs. If a job
with the same key already exists in a non-terminal state, the create call
returns the existing job instead of creating a duplicate.

Current deduplication keys:

| Type | Key |
|---|---|
| import | `import:{importId}` |
| audiobook | `audiobook:{aiJobId}` |
| translation | `translation:{bookId}-{languageCode}[-{chapterId}]` |
| tts-preview | `tts-preview:{jobId}` |
| marketing | `marketing:{campaignId}-{jobName}` |

### Worker idempotency

Workers **must** tolerate being called more than once for the same job:

1. Check current status before starting — skip if already `succeeded`.
2. Use content hashing where possible (e.g. `chapter_audio_cache` for TTS).
3. Write results atomically — partial writes must not leave the job in an
   inconsistent state.
4. Side effects (storage uploads, external API calls) should be idempotent or
   guarded by existence checks.

---

## Cancel semantics

1. A job in `queued` state can be cancelled immediately by setting
   `status = 'cancelled'`.
2. A job in `running` state is cancelled cooperatively:
   - The caller sets a cancel flag (currently via `output.cancelRequested`).
   - The worker checks the flag at safe checkpoints and transitions to
     `cancelled`.
   - Workers must not leave resources in a dirty state on cancellation.
3. Jobs in terminal states (`succeeded`, `failed`, `cancelled`) cannot be
   cancelled.

---

## Worker responsibilities

### On pickup (`queued → running`)

1. Set `status = 'running'`, `started_at = now()`, `updated_at = now()`.
2. Verify the job is still valid (user exists, book exists, etc.).
3. If validation fails, transition directly to `failed` with a descriptive
   error.

### During processing

1. Update `progress` at meaningful intervals (not more than once per second).
2. Set `updated_at = now()` on every progress update.
3. Check for cancellation at safe checkpoints.
4. Log structured output with the job `id` and `type` for traceability.

### On success (`running → succeeded`)

1. Set `status = 'succeeded'`, `progress = 100`, `finished_at = now()`.
2. Populate `result` with output data.
3. Clean up temporary resources (temp files, intermediate storage).

### On failure

1. If retryable and `retries < maxAttempts`:
   - Increment `retries`.
   - Set `status = 'queued'`, `error` to last error message.
   - BullMQ handles re-enqueue with backoff automatically.
2. If non-retryable or retries exhausted:
   - Set `status = 'failed'`, `error` to final error, `finished_at = now()`.
   - Clean up temporary resources.

### On cancellation

1. Stop processing at the next safe checkpoint.
2. Set `status = 'cancelled'`, `finished_at = now()`.
3. Clean up partial results and temporary resources.
4. Do **not** set `error` — cancellation is not an error.

---

## Stale job detection

A job is considered stale if:

- Status is `running` AND `updated_at` is older than 30 minutes AND no control
  flags are set.

Stale jobs should be surfaced in monitoring. Automatic recovery (resetting to
`queued`) is deferred to a future implementation.

---

## Migration path

This document defines the target contract. Existing tables will be migrated in
phases:

1. **Phase 1** (this PR): Document the canonical model. No schema changes.
2. **Phase 2**: Rename `ai_jobs` columns (`kind→type`, `input→payload`,
   `output→result`) and align status values (`pending→queued`,
   `processing→running`, `completed→succeeded`).
3. **Phase 3**: Migrate `book_imports` and `tts_preview_jobs` into `ai_jobs`
   with appropriate `type` values.
4. **Phase 4**: Convert `book_versions` translation status to be driven by
   `ai_jobs` rows, keeping `book_versions.status` as a denormalized cache.

Each phase will be a separate PR. No existing pipelines will be broken during
migration — the normalisation layer (`lib/job-status.ts` and `job_status_view`)
will be updated to handle both old and new schemas during the transition.

---

## Concrete examples

### 1. Translation job

```json
{
  "id": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  "type": "translation",
  "status": "succeeded",
  "progress": 100,
  "payload": {
    "bookId": "b7e8f9a0-1234-4bcd-9ef0-abcdef123456",
    "bookVersionId": "c3d4e5f6-7890-4abc-def0-123456789abc",
    "sourceLanguage": "sv",
    "targetLanguage": "en",
    "chapterIds": [
      "ch-001-uuid",
      "ch-002-uuid",
      "ch-003-uuid"
    ]
  },
  "result": {
    "translatedChapters": 3,
    "totalChapters": 3,
    "targetVersionId": "d4e5f6a7-8901-4bcd-ef01-23456789abcd",
    "wordCount": 24500
  },
  "error": null,
  "retries": 0,
  "user_id": "u-author-1111-2222-3333",
  "book_id": "b7e8f9a0-1234-4bcd-9ef0-abcdef123456",
  "book_version_id": "d4e5f6a7-8901-4bcd-ef01-23456789abcd",
  "language": "en",
  "created_at": "2026-03-04T10:00:00.000Z",
  "updated_at": "2026-03-04T10:04:32.000Z",
  "started_at": "2026-03-04T10:00:05.000Z",
  "finished_at": "2026-03-04T10:04:32.000Z"
}
```

### 2. Audiobook generation job

```json
{
  "id": "f6a7b8c9-d0e1-4f2a-3b4c-5d6e7f8a9b0c",
  "type": "audiobook",
  "status": "running",
  "progress": 42,
  "payload": {
    "bookId": "b7e8f9a0-1234-4bcd-9ef0-abcdef123456",
    "bookVersionId": "c3d4e5f6-7890-4abc-def0-123456789abc",
    "voiceId": "Ryan",
    "language": "sv",
    "scope": "book",
    "chapterIds": [
      "ch-001-uuid",
      "ch-002-uuid",
      "ch-003-uuid",
      "ch-004-uuid",
      "ch-005-uuid",
      "ch-006-uuid",
      "ch-007-uuid"
    ]
  },
  "result": {
    "completedChapters": 3,
    "totalChapters": 7,
    "generatedFiles": [
      "books/b7e8f9a0/audio/ch-001.wav",
      "books/b7e8f9a0/audio/ch-002.wav",
      "books/b7e8f9a0/audio/ch-003.wav"
    ]
  },
  "error": null,
  "retries": 0,
  "user_id": "u-author-1111-2222-3333",
  "book_id": "b7e8f9a0-1234-4bcd-9ef0-abcdef123456",
  "book_version_id": "c3d4e5f6-7890-4abc-def0-123456789abc",
  "language": "sv",
  "created_at": "2026-03-04T14:00:00.000Z",
  "updated_at": "2026-03-04T14:12:48.000Z",
  "started_at": "2026-03-04T14:00:03.000Z",
  "finished_at": null
}
```

### 3. Recommendations generation job

```json
{
  "id": "e5d4c3b2-a1f0-4e9d-8c7b-6a5f4e3d2c1b",
  "type": "recommendations",
  "status": "failed",
  "progress": 60,
  "payload": {
    "userId": "u-reader-4444-5555-6666",
    "strategy": "collaborative-filtering",
    "maxResults": 20,
    "excludeBookIds": [
      "already-read-book-1",
      "already-read-book-2"
    ]
  },
  "result": null,
  "error": "Embedding service timeout after 30s",
  "retries": 2,
  "user_id": "u-reader-4444-5555-6666",
  "book_id": null,
  "book_version_id": null,
  "language": null,
  "created_at": "2026-03-04T08:30:00.000Z",
  "updated_at": "2026-03-04T08:31:14.000Z",
  "started_at": "2026-03-04T08:30:02.000Z",
  "finished_at": "2026-03-04T08:31:14.000Z"
}
```

---

## Worker implementation example

Pseudo-code for a canonical worker processing loop:

```
function processJob(job):
    row = db.selectOne("SELECT * FROM ai_jobs WHERE id = ?", job.id)

    // ── Guard: already completed or cancelled ──
    if row.status in ("succeeded", "failed", "cancelled"):
        log("Skipping terminal job", job.id)
        return

    // ── Mark running ──
    db.update("ai_jobs", job.id, {
        status:     "running",
        started_at: now(),
        updated_at: now(),
    })

    try:
        // ── Validate inputs ──
        book = db.selectOne("SELECT * FROM books WHERE id = ?", row.payload.bookId)
        if book is null:
            throw NonRetryableError("Book not found: " + row.payload.bookId)

        items = getWorkItems(row.payload)
        total = len(items)

        for i, item in enumerate(items):
            // ── Check cancellation ──
            fresh = db.selectOne("SELECT status FROM ai_jobs WHERE id = ?", job.id)
            if fresh.status == "cancelled":
                log("Job cancelled, stopping", job.id)
                cleanup(partialResults)
                return

            // ── Do work ──
            processItem(item)

            // ── Update progress ──
            db.update("ai_jobs", job.id, {
                progress:   floor((i + 1) / total * 100),
                updated_at: now(),
            })

        // ── Success ──
        db.update("ai_jobs", job.id, {
            status:      "succeeded",
            progress:    100,
            result:      buildResult(items),
            finished_at: now(),
            updated_at:  now(),
        })

    catch NonRetryableError as e:
        // ── Permanent failure — do not retry ──
        db.update("ai_jobs", job.id, {
            status:      "failed",
            error:       e.message,
            finished_at: now(),
            updated_at:  now(),
        })

    catch RetryableError as e:
        if row.retries + 1 >= MAX_ATTEMPTS:
            // ── Retries exhausted ──
            db.update("ai_jobs", job.id, {
                status:      "failed",
                error:       e.message,
                retries:     row.retries + 1,
                finished_at: now(),
                updated_at:  now(),
            })
        else:
            // ── Re-queue for retry (BullMQ handles backoff) ──
            db.update("ai_jobs", job.id, {
                status:     "queued",
                error:      e.message,
                retries:    row.retries + 1,
                updated_at: now(),
            })
            throw e  // let BullMQ schedule the retry
```
