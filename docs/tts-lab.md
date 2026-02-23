# TTS Lab (intern)

Intern sida för att testa Qwen TTS utan att köra inference i Next.js. All inference sker i en separat worker.

## Översikt

- **Sida**: `/author/tts-lab` (kräver inloggad author)
- **API**: `POST /api/tts/qwen/preview`, `GET /api/tts/qwen/preview/status?jobId=...`
- **Worker**: `npm run tts-preview-worker` (pollar DB, ingen Redis)

## Starta lokalt

### 1. Kör migration

```bash
cd apps/web
npx supabase db push
# eller: supabase migration up
```

### 2. Starta webben

```bash
npm run dev
```

Öppna `http://localhost:3000/author/tts-lab` (logga in som author).

### 3. Starta TTS preview worker

I en separat terminal:

```bash
cd apps/web
npm run tts-preview-worker
```

Eller från repo root:

```bash
npm run tts-preview-worker
```

Worker pollar `tts_preview_jobs` var 2:e sekund, plockar `queued`-jobb, kör Qwen TTS via Python-scriptet, sparar ljud i Supabase Storage (`tts_previews` bucket) och uppdaterar jobbstatus.

## Krav

- Supabase env (URL, service role key)
- Qwen TTS Python-miljö: `QWEN_TTS_PYTHON` (t.ex. `qwen3tts-env/bin/python3.12`), `QWEN_TTS_SCRIPT` (default: `apps/web/scripts/qwen_tts_synthesize.py`)

## Feature flag

Sätt `TTS_LAB_ENABLED=false` eller `NEXT_PUBLIC_TTS_LAB_ENABLED=false` för att stänga av. Default: på.
