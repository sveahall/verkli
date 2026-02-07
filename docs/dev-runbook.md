# Dev Runbook — Verkli Web

> Snabbguide: starta hela dev-stacken och verifiera att jobb fungerar.

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
SUPABASE_SERVICE_ROLE_KEY=...
REDIS_URL=redis://localhost:6379
```

---

## 2. Startordning — 5 terminaler

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

### Terminal 5 — Audiobook / TTS worker

```bash
npm run audiobook-worker
# Lyssnar på kö: audiobook-generation

# Eller TTS (separat terminal om båda behövs):
npm run tts-worker
# Lyssnar på kö: tts-generation
```

> **Tips:** Du behöver bara starta de workers du faktiskt ska testa. Import-worker räcker för grundläggande bokimport.

---

## 3. Könamn → Worker-mappning

| Kö | Worker-kommando | Script |
|----|-----------------|--------|
| `book-import-extract` | `npm run import-worker` | `apps/web/scripts/import-worker.ts` |
| `book-translation` | `npm run translate-worker` | `apps/web/scripts/translation-worker.ts` |
| `audiobook-generation` | `npm run audiobook-worker` | `apps/web/scripts/audiobook-worker.ts` |
| `tts-generation` | `npm run tts-worker` | `apps/web/scripts/tts-worker.ts` |

Statuskontrakt i databasen:

- `book_imports.status`: `pending` → `extracting` → `completed` / `failed`
- `ai_jobs.status`: `pending` → `processing` → `completed` / `failed`
- `book_versions.status` (översättning): `translating` → `done` / `failed`

---

## 4. Felsökning

### Redis ej nåbar

```
[import] REDIS_URL not set. Set REDIS_URL...
[import] Redis not reachable. Check REDIS_URL...
```

**Fix:**

```bash
# Kontrollera att containern kör
docker ps | grep verkli-redis

# Starta om vid behov
docker compose up -d

# Testa anslutning
docker exec verkli-redis redis-cli ping
```

### Saknad env / worker kraschar vid start

```
Missing required env: SUPABASE_SERVICE_ROLE_KEY
```

**Fix:** Kontrollera att `apps/web/.env.local` finns och har alla obligatoriska variabler. Workers laddar env via `load-dotenv.ts` som läser just den filen.

### Översättningsworker: OpusMT-fel

```
assertOpusEnv failed
```

**Fix:** Sätt `OPUSMT_PYTHON` till den virtuella Python-miljöns binary och `OPUSMT_MODELS_DIR` till modellkatalogen:

```bash
OPUSMT_PYTHON=/abs/path/to/venv/bin/python
OPUSMT_MODELS_DIR=/abs/path/to/apps/web/models
```

### TTS/Audiobook-worker: binär saknas

```
TTS_BIN not found
```

**Fix:** Installera Piper TTS och peka `TTS_BIN`, `TTS_MODEL_PATH`, `TTS_CONFIG_PATH` till rätt sökvägar i `.env.local`.

### Jobb fastnar i `processing`

Trolig orsak: workern kraschade mitt i ett jobb.

```bash
# 1. Kontrollera att workern fortfarande kör
# 2. Kolla loggen i worker-terminalen
# 3. Manuell reset i databasen (om nödvändigt):

-- För ai_jobs:
UPDATE ai_jobs SET status = 'failed', updated_at = now()
WHERE status = 'processing' AND updated_at < now() - interval '10 minutes';

-- För book_imports:
UPDATE book_imports SET status = 'failed', updated_at = now()
WHERE status = 'extracting' AND updated_at < now() - interval '10 minutes';
```

### Port 3000 redan upptagen

```bash
lsof -ti:3000 | xargs kill -9
npm run dev
```

---

## 5. Smoke test — Import-flödet

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

### TTS smoke test (separat)

```bash
npm run tts:smoke
# Kör scripts/tts_smoke_test.sh
# Verifierar att Piper-binären och modellerna fungerar
```

---

## 6. Stoppa allt

```bash
# Workers: Ctrl+C i varje terminal (graceful shutdown via SIGTERM)
# Redis:
docker compose down
# Behåll data: docker compose stop
```

---

## 7. Snabbreferens

```bash
# Hela startsekvensen (kopiera rad för rad till separata terminaler):
docker compose up -d                # T1: Redis
npm run dev                         # T2: Next.js
npm run import-worker               # T3: Import
npm run translate-worker            # T4: Översättning (valfri)
npm run audiobook-worker            # T5: Ljudbok (valfri)
```
