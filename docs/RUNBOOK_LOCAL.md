# RUNBOOK_LOCAL

## TLDR
1. Primär lokalkörning idag: `apps/web` + Redis lokalt + Supabase (oftast remote projekt).
2. Startordning: env -> Redis -> Next -> workers.
3. Web kör på `http://localhost:3000`.
4. Redis kör på `redis://localhost:6379` via `docker compose up -d`.
5. Import/translation/audiobook/tts har npm-scripts.
6. Social publish och recommendations workers saknar npm-scripts och startas med `npx tsx ...`.
7. `/api/health` och `/api/health/queue` är snabbaste sanity check.
8. Kvalitetsstatus i nuvarande repo: build passerar, test/lint failar.

## Förutsättningar
- [ ] Node.js 20+
- [ ] npm 10+
- [ ] Docker (för Redis)
- [ ] Supabase credentials (minst URL + anon key + service role key)

Kontroll:
```bash
node -v
npm -v
docker --version
```

## Portkarta
| Tjänst | Port | Kommentar |
|---|---:|---|
| Next.js app | `3000` | `npm run dev` |
| Redis | `6379` | `docker-compose.yml` |
| Supabase API (lokal, optional) | `54321` | `apps/web/supabase/config.toml` |
| Supabase DB (lokal, optional) | `54322` | `apps/web/supabase/config.toml` |
| Supabase Studio (lokal, optional) | `54323` | `apps/web/supabase/config.toml` |
| Supabase Inbucket (lokal, optional) | `54324` | `apps/web/supabase/config.toml` |

## 1) Miljöfil
Skapa lokal env:
```bash
cp apps/web/.env.example apps/web/.env.local
```

Minsta bas för app + workers:
```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_SITE_URL=http://localhost:3000
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
REDIS_URL=redis://localhost:6379
```

## 2) Starta Redis
```bash
docker compose up -d
```

Verifiera:
```bash
# variant A
docker compose ps

# variant B (om redis-cli finns lokalt)
redis-cli -u redis://localhost:6379 ping
```
Förväntat: `PONG`.

## 3) Starta Web App
```bash
npm run dev
```
Öppna: `http://localhost:3000`

## 4) Starta Workers
Kör varje worker i egen terminal.

### 4.1 Import worker
```bash
npm run import-worker
```

### 4.2 Translation worker
Kräver extra env:
```env
OPUSMT_PYTHON=/abs/path/to/python
OPUSMT_MODELS_DIR=/abs/path/to/apps/web/models
```
Start:
```bash
npm run translate-worker
```

### 4.3 Audiobook worker
Minsta extra env:
```env
AUDIOBOOK_ENABLED=true
AUDIOBOOK_STORAGE_BUCKET=audiobooks
TTS_BIN=/abs/path/to/piper
TTS_MODEL_PATH=/abs/path/to/vendor/tts/voices/sv_SE-nst-medium.onnx
TTS_CONFIG_PATH=/abs/path/to/vendor/tts/voices/sv_SE-nst-medium.onnx.json
TTS_DATA_DIR=/abs/path/to/vendor/tts/voices
```
Start:
```bash
npm run audiobook-worker
```

### 4.4 TTS worker
Minsta extra env:
```env
TTS_ENABLED=true
TTS_STORAGE_BUCKET=tts-outputs
TTS_BIN=/abs/path/to/piper
```
Start:
```bash
npm run tts-worker
```

### 4.5 Social publish worker (saknar npm-script)
```bash
cd apps/web
npx tsx scripts/social-publish-worker.ts
```
För non-mock:
```env
SOCIAL_TOKEN_KEY=<base64-nyckel>
SOCIAL_OAUTH_STATE_SECRET=<hemlighet>
X_CLIENT_ID=...
X_CLIENT_SECRET=...
TIKTOK_CLIENT_KEY=...
TIKTOK_CLIENT_SECRET=...
INSTAGRAM_CLIENT_ID=...
INSTAGRAM_CLIENT_SECRET=...
```

### 4.6 Recommendations worker (saknar npm-script)
```bash
cd apps/web
npx tsx scripts/recommendations-worker.ts
```
Worker kör intern schemaläggning var 6:e timme.

## 5) Snabb Hälsokontroll
```bash
curl -s http://localhost:3000/api/health
curl -s http://localhost:3000/api/health/queue
```

Notera:
- `/api/health/queue` verifierar Redis + translation queue reachability, inte full queue-metrics per worker.

## 6) Flödes-Smoketests

### Import
- Kör UI-flöde via `/author/books/[id]` eller import-endpoint.
- Kontrollera att `book_imports.status` går `pending -> extracting -> completed`.

### Translation
- Anropa `POST /api/books/[id]/translate`.
- Kontrollera `book_versions.status` (`translating -> done|failed`).

### Audiobook
- Anropa `POST /api/books/[id]/audiobook/generate`.
- Kontrollera `ai_jobs` + `audiobook_assets` + `GET /api/books/[id]/audiobook/status`.

### TTS endpoint
```bash
curl -X POST http://localhost:3000/api/tts \
  -H "Content-Type: application/json" \
  -d '{"text":"Hej från lokal runbook"}' \
  --output /tmp/verkli-tts.wav
```

## 7) Stripe/Resend/Social (endast om du testar dessa features)

### Billing
```env
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
PRICE_PLUS=...
PRICE_PRO=...
STRIPE_CUSTOMER_PORTAL_RETURN_URL=http://localhost:3000/account/billing
STRIPE_CHECKOUT_SUCCESS_URL=http://localhost:3000/account/billing?checkout=success
STRIPE_CHECKOUT_CANCEL_URL=http://localhost:3000/account/billing?checkout=cancel
```

### Email (waitlist/newsletters)
```env
RESEND_API_KEY=...
RESEND_FROM_EMAIL=...
```

## 8) Kvalitetskommandon
```bash
npm run -w @verkli/web test
npm run -w @verkli/web lint
npm run -w @verkli/web build:ci
```

Nuvarande observerad status i detta repo:
- `test`: fail (17 tester)
- `lint`: fail (6 errors)
- `build:ci`: pass (med varningar från `epub`-beroenden)

## 9) Lokal Supabase (optional, experimentellt med nuvarande repo)
Det finns en lokal Supabase-konfig i `apps/web/supabase/config.toml`.

Startförsök:
```bash
cd apps/web
npx supabase start
```

Viktigt:
- `config.toml` refererar `./seed.sql` som saknas i repo.
- Schema är splittrat över två migrationsspår (`apps/web` och `packages/db`), så lokal bootstrap kan avvika från driftad miljö.

## 10) Vanliga Problem
| Symptom | Trolig orsak | Åtgärd |
|---|---|---|
| Worker dör direkt med env-fel | saknad `SUPABASE_SERVICE_ROLE_KEY`/`REDIS_URL` | uppdatera `apps/web/.env.local` |
| Translation failar direkt | saknad `OPUSMT_PYTHON`/`OPUSMT_MODELS_DIR` | sätt båda + verifiera modellfiler |
| Audiobook/TTS failar | fel `TTS_BIN` eller saknade modellfiler | använd absolut path + kontrollera filerna |
| Social worker failar | saknad `SOCIAL_TOKEN_KEY` | sätt env eller använd mock mode i dev |
| `npm run runway:text-to-video` failar | script pekar på saknad fil | använd API-route istället tills script fixas |

## 11) Stoppa Allt
```bash
# stoppa app/workers via Ctrl+C i respektive terminal
docker compose down
```
