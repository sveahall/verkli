# Worker Commands (local)

## Förutsättningar

- Redis körs: `docker compose up -d`
- Miljövariabler satta i `apps/web/.env.local`:
  - `REDIS_URL=redis://localhost:6379`
  - `SUPABASE_SERVICE_ROLE_KEY=...`
  - `NEXT_PUBLIC_SUPABASE_URL=...`
  - `AUDIOBOOK_STORAGE_BUCKET=audiobooks`

## Kör från repo root

- Kanonisk runtime för alla workers: `npm run start-workers`
- Import worker: `npm run import-worker`
- Translation worker: `npm run translate-worker`
- Audiobook worker: `npm run audiobook-worker`
- Marketing worker: `npm run marketing-worker`
- Social publish worker: `npm run social-publish-worker`
- Recommendations worker: `npm run recommendations-worker`
- Notifications worker: `npm run notifications-worker`

## Kör direkt i apps/web

- Kanonisk runtime för alla workers: `npm run start-workers`
- Import worker: `npm run import-worker`
- Translation worker: `npm run translate-worker`
- Audiobook worker: `npm run audiobook-worker`
- Marketing worker: `npm run marketing-worker`
- Social publish worker: `npm run social-publish-worker`
- Recommendations worker: `npm run recommendations-worker`
- Notifications worker: `npm run notifications-worker`

## Köer

- `book-import-extract`
- `book-translation`
- `audiobook-generation`
- `marketing-campaign`
- `social-publish`
- `recommendations`
- `notifications`

## Status-contract (DB)

- `ai_jobs.status`: `pending | processing | completed | failed | cancelled`
- `books.audiobook_status`: `not_started | generating | published | failed`
- `audiobook` source of truth: generated row i `audiobook_assets` (`status='generated'` + `audio_url`)
