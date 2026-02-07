# Worker Commands (local)

## Förutsättningar

- Redis körs: `docker compose up -d`
- Miljövariabler satta i `apps/web/.env.local`:
  - `REDIS_URL=redis://localhost:6379`
  - `SUPABASE_SERVICE_ROLE_KEY=...`
  - `NEXT_PUBLIC_SUPABASE_URL=...`
  - `AUDIOBOOK_STORAGE_BUCKET=audiobooks`
  - `TTS_STORAGE_BUCKET=tts-outputs`

## Kör från repo root

- Import worker: `npm run import-worker`
- Translation worker: `npm run translate-worker`
- Audiobook worker: `npm run audiobook-worker`
- TTS worker: `npm run tts-worker`

## Kör direkt i apps/web

- Import worker: `npm run import-worker`
- Translation worker: `npm run translate-worker`
- Audiobook worker: `npm run audiobook-worker`
- TTS worker: `npm run tts-worker`

## Köer

- `book-import-extract`
- `book-translation`
- `audiobook-generation`
- `tts-generation`

## Status-contract (DB)

- `ai_jobs.status`: `pending | processing | completed | failed | cancelled`
- `books.audiobook_status`: `not_started | generating | published | failed`
- `audiobook` source of truth: generated row i `audiobook_assets` (`status='generated'` + `audio_url`)
