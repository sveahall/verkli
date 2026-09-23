# Dev Runbook — Verkli Web

> Snabbguide: starta hela dev-stacken och verifiera att jobb fungerar.
> Operational deep-dive för workers ligger i [workers-runbook.md](./workers-runbook.md).

---

## 1. Förutsättningar

| Verktyg | Version | Kontroll |
|---------|---------|----------|
| Node.js | 20+ | `node -v` |
| Docker | 24+ | `docker --version` |
| npm | 10+ | `npm -v` |

Skapa env-fil om den saknas:

```bash
cp apps/web/.env.example apps/web/.env.local
```

Minsta krav i `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_SITE_URL=http://localhost:3000
REDIS_URL=redis://localhost:6379
```

---

## 2. Portkarta

| Tjänst | Port | Kommentar |
|---|---:|---|
| Next.js app | `3000` | `npm run dev` |
| Redis | `6379` | `docker compose up -d` |
| Supabase API (lokal, optional) | `54321` | `apps/web/supabase/config.toml` |
| Supabase DB (lokal, optional) | `54322` | `apps/web/supabase/config.toml` |
| Supabase Studio (lokal, optional) | `54323` | `apps/web/supabase/config.toml` |
| Supabase Inbucket (lokal, optional) | `54324` | `apps/web/supabase/config.toml` |

---

## 3. Startordning — 5 terminaler

Starta i ordning. Varje rad = en terminal.

### Terminal 1 — Redis

```bash
docker compose up -d
# Verifiera:
docker exec verkli-redis redis-cli ping
# Förväntat: PONG
```

### Terminal 2 — Next.js dev server

```bash
npm run dev
# http://localhost:3000
```

### Terminal 3 — Import worker

```bash
npm run import-worker
# Lyssnar på kö: book-import-extract
```

### Terminal 4 — Translation worker

```bash
npm run translate-worker
# Lyssnar på kö: book-translation
# Kräver extra env: OPUSMT_PYTHON, OPUSMT_MODELS_DIR
```

### Terminal 5 — Audiobook worker

```bash
npm run audiobook-worker
# Lyssnar på kö: audiobook-generation
```

> **Tips:** Du behöver bara starta de workers du faktiskt ska testa. Import-worker räcker för grundläggande bokimport. Kanonisk produktionspath är `npm run start-workers` som startar alla i ett process — använd den när du behöver hela kedjan.

### Övriga workers (vid behov)

```bash
npm run marketing-worker          # marketing-campaign
npm run social-publish-worker     # social-publish
npm run recommendations-worker    # recommendations
npm run notifications-worker      # notifications
npm run tts-preview-worker        # TTS Lab (DB-pollar, ingen Redis)
```

För `social-publish-worker` non-mock krävs OAuth-creds (se TTS Lab/social i `tts-lab.md` respektive workers-runbook). För `recommendations-worker` schemaläggs jobb internt var 6:e timme.

---

## 4. Könamn → Worker-mappning

| Kö | Worker-kommando | Script |
|----|-----------------|--------|
| `book-import-extract` | `npm run import-worker` | `apps/web/scripts/import-worker.ts` |
| `book-translation` | `npm run translate-worker` | `apps/web/scripts/translation-worker.ts` |
| `audiobook-generation` | `npm run audiobook-worker` | `apps/web/scripts/audiobook-worker.ts` |
| `marketing-campaign` | `npm run marketing-worker` | `apps/web/scripts/marketing-worker.ts` |
| `social-publish` | `npm run social-publish-worker` | `apps/web/scripts/social-publish-worker.ts` |
| `recommendations` | `npm run recommendations-worker` | `apps/web/scripts/recommendations-worker.ts` |
| `notifications` | `npm run notifications-worker` | `apps/web/scripts/notifications-worker.ts` |

Statuskontrakt i databasen:

- `book_imports.status`: `pending` → `extracting` → `completed` / `failed`
- `ai_jobs.status`: `pending` → `processing` → `completed` / `failed`
- `book_versions.status` (översättning): `translating` → `done` / `failed`
- `books.audiobook_status`: `not_started` → `generating` → `published` / `failed`

---

## 5. Snabb hälsokontroll

```bash
curl -s http://localhost:3000/api/health
curl -s -H "x-ops-health-token: $OPS_HEALTH_TOKEN" http://localhost:3000/api/health/queue
```

- `/api/health` — publik liveness (minimal payload för icke-admin).
- `/api/health/queue` — Redis + translation queue reachability (kräver token).
- `/admin/queues` — full BullMQ-dashboard för admins (Sprint 0.5).

---

## 6. Felsökning

### Redis ej nåbar

```
[import] REDIS_URL not set. Set REDIS_URL...
[import] Redis not reachable. Check REDIS_URL...
```

**Fix:**

```bash
docker ps | grep verkli-redis
docker compose up -d
docker exec verkli-redis redis-cli ping
```

### Saknad env / worker kraschar vid start

```
Missing required env: SUPABASE_SERVICE_ROLE_KEY
```

**Fix:** Verifiera att `apps/web/.env.local` finns med alla obligatoriska variabler. Workers laddar via `load-dotenv.ts` som läser den filen.

### Översättningsworker: OpusMT-fel

```
assertOpusEnv failed
```

**Fix:**

```bash
OPUSMT_PYTHON=/abs/path/to/venv/bin/python
OPUSMT_MODELS_DIR=/abs/path/to/apps/web/models
```

### Audiobook-worker: narration provider saknas

```
Narrator provider removed
```

**Fix:** Lokal legacy-TTS är borttaget. Integrera Qwen3 TTS istället.

### Jobb fastnar i `processing`

Trolig orsak: workern kraschade mitt i ett jobb.

```sql
-- Reset i databasen om nödvändigt
UPDATE ai_jobs SET status = 'failed', updated_at = now()
WHERE status = 'processing' AND updated_at < now() - interval '10 minutes';

UPDATE book_imports SET status = 'failed', updated_at = now()
WHERE status = 'extracting' AND updated_at < now() - interval '10 minutes';
```

För Redis-side stalled-jobs, se [workers-runbook.md §6](./workers-runbook.md).

### Port 3000 redan upptagen

```bash
lsof -ti:3000 | xargs kill -9
npm run dev
```

### Övriga vanliga problem

| Symptom | Trolig orsak | Åtgärd |
|---|---|---|
| Worker dör direkt med env-fel | saknad `SUPABASE_SERVICE_ROLE_KEY`/`REDIS_URL` | uppdatera `apps/web/.env.local` |
| Translation failar direkt | saknad `OPUSMT_PYTHON`/`OPUSMT_MODELS_DIR` | sätt båda + verifiera modellfiler |
| Audiobook failar | narrator-provider saknas i legacy-flödet | migrera till Qwen3 TTS |
| Social worker failar | saknad `SOCIAL_TOKEN_KEY` | sätt env eller använd mock mode i dev |

---

## 7. Smoke test — Import-flödet

Minimal verifiering att hela kedjan fungerar.

### Steg 1: Starta stacken

- [ ] Redis kör (`docker exec verkli-redis redis-cli ping` → PONG)
- [ ] Dev server kör (`http://localhost:3000` svarar)
- [ ] Import-worker kör (logg visar `[import] Worker ready`)

### Steg 2: Skapa ett importjobb

1. Logga in på `http://localhost:3000`
2. Gå till bokimport-sidan
3. Ladda upp en liten EPUB/DOCX-fil
4. Worker-terminalen ska logga att jobbet plockas upp

### Steg 3: Verifiera

- [ ] Worker-logg visar `completed` utan fel
- [ ] Boken dyker upp i din boklista i UI:t
- [ ] `book_imports.status` = `completed` i databasen

---

## 8. Stripe / Resend (om du testar dessa)

```env
# Billing
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
PRICE_PLUS=...
PRICE_PRO=...
STRIPE_CUSTOMER_PORTAL_RETURN_URL=http://localhost:3000/account/billing
STRIPE_CHECKOUT_SUCCESS_URL=http://localhost:3000/account/billing?checkout=success
STRIPE_CHECKOUT_CANCEL_URL=http://localhost:3000/account/billing?checkout=cancel

# Email (waitlist/newsletters)
RESEND_API_KEY=...
RESEND_FROM_EMAIL=...
```

För webhook-testning lokalt: använd `stripe listen --forward-to http://localhost:3000/api/stripe/webhook`.

---

## 9. Lokal Supabase + migrations

Canonical migrationskälla: `apps/web/supabase/migrations`. Den arkiverade
`packages/db/supabase/migrations_archived` är referens.

```bash
# Starta lokal Supabase
cd apps/web
npx supabase start

# Applicera alla migrations (deterministisk full reset; --no-seed eftersom
# config.toml refererar en seed.sql som inte är committad)
npx supabase db reset --local --no-seed

# Endast pending migrations
npx supabase migration up --local

# Skapa ny migration
npx supabase migration new <beskrivande_namn>
```

Verifiera att inte två migrations skapar samma tabell:

```bash
cd /Users/admin/verkli-web
rg -n -i "create table .*billing_accounts|create table .*stripe_events|create table .*user_credits" \
  apps/web/supabase/migrations
```

---

## 10. Kvalitetskommandon

```bash
npm run -w @verkli/web test
npm run -w @verkli/web lint
npm run -w @verkli/web build:ci

# Beta gate (env → tests → lint → english-default → no-placeholders → dead-code → build)
npm run qa:beta
```

---

## 11. Stoppa allt

```bash
# Workers: Ctrl+C i varje terminal (graceful shutdown via SIGTERM)
docker compose down          # tar bort containrar (data försvinner)
# eller:
docker compose stop          # stoppa men behåll data
```

---

## 12. Snabbreferens

```bash
# Hela startsekvensen — kopiera rad för rad till separata terminaler:
docker compose up -d                # T1: Redis
npm run dev                         # T2: Next.js
npm run import-worker               # T3: Import (eller `npm run start-workers` för alla)
npm run translate-worker            # T4: Översättning (valfri)
npm run audiobook-worker            # T5: Ljudbok (valfri)
```
