# Baseline System State

Last updated: 2026-03-04

## Scope

This baseline documents the current production-critical async flows before architecture changes.

Primary verified chain:

`import -> translate -> audiobook`

## Working Pipelines

### 1. Import pipeline

- Entry: `book_imports` row + BullMQ job `extract` on queue `book-import-extract`.
- Worker: `apps/web/scripts/import-worker.ts`.
- Status contract: `book_imports.status` transitions `pending -> extracting -> completed|failed`.
- Outputs:
  - `books` row (legacy flow) or update of scoped target book.
  - `book_versions` row.
  - `chapters` rows (`source_text`, `content_hash`, TipTap content).
  - Source import file in storage bucket `book-imports` (or local fallback in development).

### 2. Translation pipeline

- Entry: BullMQ job `translate` on queue `book-translation`.
- Worker: `apps/web/scripts/translation-worker.ts`.
- Status contract: `book_versions.status` transitions `draft|queued -> translating -> done|failed`.
- Outputs:
  - Target-language `book_versions` row.
  - Upserted translated `chapters` rows on `(book_version_id, order)`.

### 3. Audiobook pipeline

- Entry: `ai_jobs` row (`kind='audiobook_generation'`) + BullMQ job `generate` on queue `audiobook-generation`.
- Worker: `apps/web/scripts/audiobook-worker.ts`.
- Status contract:
  - `ai_jobs.status` transitions `pending -> processing -> completed|failed`.
  - `books.audiobook_status` transitions `not_started|failed -> generating -> published|failed`.
- Outputs:
  - `chapter_audio_cache` rows + per-chapter audio objects in storage bucket `audiobooks` (or `AUDIOBOOK_STORAGE_BUCKET`).
  - Manifest and/or stitched audio object in the same bucket.
  - `audiobook_assets` row with `status='generated'`.

### 4. Recommendations pipeline (existing, unaffected)

- Entry: BullMQ job `compute` on queue `recommendations`.
- Worker: `apps/web/scripts/recommendations-worker.ts`.
- Notes: DB-scoring pipeline, no external model dependency.

## Queues

- `book-import-extract` (`extract`)
- `book-translation` (`translate`)
- `audiobook-generation` (`generate`)
- `recommendations` (`compute`)
- `social-publish` (`publish`)
- `notifications`
- `marketing-campaign`

Source of truth: `apps/web/src/lib/queue-names.ts`.

## Workers

- `npm run import-worker`
- `npm run translate-worker`
- `npm run audiobook-worker`
- `npm run recommendations-worker`
- `npm run combined-worker` (import + translation only)

Worker env baseline:

- `REDIS_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL`

Additional model env:

- Translation: `OPUSMT_PYTHON`, `OPUSMT_MODELS_DIR`
- Audiobook: optional provider/model env (`QWEN_TTS_*`, `AI_NARRATOR_MODEL`, `AUDIOBOOK_STORAGE_BUCKET`)

## AI Models Used

### Translation

- Local Opus MT via CTranslate2 (`apps/web/src/lib/opus.ts`)
- Current supported language pairs in code:
  - `sv -> en`
  - `en -> sv`

### Audiobook TTS

- Default local model: `Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice`
- Optional cloud provider path: OpenAI TTS (`tts-1`/configured by provider env)

### Smoke mode for CI baseline verification

- `PIPELINE_SMOKE_MODE=true` enables deterministic local stubs in:
  - `translation-worker` (no Opus binary invocation)
  - `audiobook-worker` (no Qwen/OpenAI runtime dependency)
- This mode is only for pipeline verification and is disabled by default.

## Baseline Verification Artifacts

- Smoke script: `scripts/pipeline-smoke-test.ts`
- CI workflow: `.github/workflows/pipeline-smoke.yml`
- Verification checks:
  - Import creates `book_imports` record and chapters.
  - Translation creates/updates translated `book_versions` and chapters.
  - Audiobook creates `audiobook_assets`, `chapter_audio_cache`, and storage objects.
  - Required status transitions are observed in DB.
