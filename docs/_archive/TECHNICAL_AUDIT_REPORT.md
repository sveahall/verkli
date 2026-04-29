# TECHNICAL AUDIT REPORT

- Projekt: `verkli-web`
- Datum: 2026-03-04
- Revisionsmetod: statisk repoanalys (inga kodändringar utöver denna rapportfil)

## 1. Executive summary

Verkli är en Supabase-baserad monorepo där `apps/web` är den faktiska produktkärnan (Next.js frontend + API + queue producers + majoriteten av workers).

Systemet har fungerande kärnflöden för:
- bokimport (asynkront)
- översättning (asynkront via lokal Opus MT)
- ljudboksproduktion (asynkront via Qwen/OpenAI TTS)
- rekommendationer (asynkront precompute + synkront fallback)
- marketing/trailer/video-generering (främst synkront i API)

Övergripande status:
- Produktfunktionalitet: relativt hög
- Driftmognad: medel
- Dokumentationskonsistens: medel/låg (tydlig drift mellan docs och kod)

### Repoevidens (filer granskade och varför)

- `package.json` (root): workspaces, root-scripts, worker-startkommandon, QA-gate.
- `apps/web/package.json`: faktisk stack, worker scripts, test/lint/build-kommandon.
- `apps/web/vercel.json`: deploymentmål (Vercel) och build/install-strategi.
- `apps/web/src/lib/queue-names.ts`: canonical kölista.
- `apps/web/src/lib/*-queue.ts`: enqueue-regler, retries, backoff, dedupe.
- `apps/web/scripts/*worker.ts`: verklig worker-topologi, concurrency, stall/lock, statusuppdatering.
- `apps/web/src/app/api/books/*`, `api/social/*`, `api/marketing/*`, `api/tts/*`, `api/reader/*`: ingressflöden och sync/async-gränser.
- `apps/web/src/lib/ai/*`, `lib/higgsfield.ts`, `lib/opus.ts`, `lib/tts/*`: AI-infrastruktur och modellkopplingar.
- `apps/web/supabase/migrations/*.sql`: primär datamodell, RLS, storage buckets.
- `packages/db/supabase/migrations/*.sql`: legacy-migrationsspår och schema-drift-risk.
- `docs/*.md` (runbooks, architecture, schema, route map, mvp): dokumentationskvalitet och avvikelser mot kod.
- `.github/workflows/ci.yml`: faktisk CI-ordning.
- `docker-compose.yml`, `infra/docker/docker-compose.yml`: lokal infra (Redis).

---

## 2. System architecture

### 2.1 Projektets syfte

Plattform för författare och läsare där författare kan:
- importera bokinnehåll
- översätta till nya språk
- generera ljudbok
- skapa marketing-material

Läsare kan:
- upptäcka/läsa böcker
- få rekommendationer
- interagera via community/sociala funktioner

### 2.2 Teknikstack

Frontend stack:
- Next.js 16 (App Router)
- React 19
- TypeScript
- Tailwind 4

Backend stack:
- Next.js API routes (Node runtime för flera AI/mediatunga routes)
- Supabase (Auth + Postgres + Storage)

Queue/system:
- Redis + BullMQ för majoriteten av bakgrundsjobb
- Separat DB-polling worker för TTS preview (ingen Redis)

AI stack:
- Translation: lokal Opus MT (Python + CTranslate2)
- TTS: lokal Qwen3 TTS (Python subprocess) + optional OpenAI TTS
- Video: Higgsfield image→video
- LLM copywriter: stub (default) eller lokal Ollama (`llama3.1`)

Deployment:
- Web: Vercel (indikerat av `apps/web/vercel.json`)
- Redis: extern tjänst (prod-exempel visar Upstash-URL), lokalt via docker-compose
- Workers: separata processer (ingen tydlig prod-orchestrering i repo)

### 2.3 Monorepo-struktur

```text
.
├── apps/
│   ├── web/                 # Huvudapp (frontend + API + worker scripts + migrations)
│   └── worker/              # Tunn wrapper för import-worker
├── packages/
│   ├── config/              # Delad eslint/tsconfig
│   ├── db/                  # Supabase-only stub + legacy migrations
│   ├── shared/              # Delade typer/kontrakt
│   └── ui/                  # UI-package (liten/stub)
├── infra/
│   └── docker/
│       └── docker-compose.yml  # Redis för lokal utveckling
├── scripts/
│   └── tts-bench.py
└── docs/
```

### 2.4 Arkitekturdiagram (text)

```text
[Browser UI / Next Client]
        |
        | HTTP (fetch/server actions)
        v
[Next.js app (apps/web)]
  - App Router pages
  - API routes
  - Authz/billing/feature flags
        |
        | sync DB/storage calls
        +-------------------------------> [Supabase Auth + Postgres + Storage]
        |
        | async enqueue
        v
     [Redis / BullMQ]
        |
        +--> [import-worker] -----------> Postgres + Storage
        +--> [translation-worker] ------> Postgres
        +--> [audiobook-worker] --------> Postgres + Storage
        +--> [social-publish-worker] ---> Postgres + External Social APIs
        +--> [marketing-worker] --------> Postgres
        +--> [recommendations-worker] --> Postgres
        +--> [notifications-worker]* ---> Postgres (*definierad men svagt inkopplad)

[Special path: TTS preview]
API -> tts_preview_jobs (DB) -> tts-preview-worker (polling) -> Storage (tts_previews)

[Direct AI path i API]
API -> Higgsfield/Ollama/stub -> DB/Storage -> response

[Frontend state update]
Polling endpoints (ex: /api/books/[id]/jobs, /api/notifications/*, /api/tts/.../status)
```

---

## 3. AI infrastructure

### 3.1 AI-komponentinventering

| Pipeline | Modell/provider | Runtime | Körs var | Trigger | Output-lagring |
|---|---|---|---|---|---|
| TTS (audiobook) | Qwen3 TTS (`Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice`) eller OpenAI TTS (`tts-1` default) | Python subprocess / HTTP | `audiobook-worker.ts` | `POST /api/books/[id]/audiobook/generate` -> BullMQ | `chapter_audio_cache`, `audiobook_assets`, bucket `audiobooks`, `ai_jobs.output` |
| TTS preview lab | Qwen3 TTS | Python subprocess | `tts-preview-worker.ts` (DB polling) | `POST /api/tts/qwen/preview` | `tts_preview_jobs`, bucket `tts_previews` |
| Translation | Opus MT (lokal CTranslate2) | Python subprocess via `spawnSync` | `translation-worker.ts` | `POST /api/books/[id]/translate` (och optional auto-enqueue efter import) | `book_versions`, `chapters` |
| Text->video (marketing/trailer) | Higgsfield (`dop-standard`) | HTTP | API routes (synkront) | `POST /api/marketing/video/generate`, `POST /api/books/[id]/trailer/build`, `POST /api/ai/text-to-video` | `media_assets`, bucket `marketing-media` |
| Content generation text | Stub copywriter (default) eller Ollama (`llama3.1`) | In-process HTTP (Ollama) | API route (synkront) | `POST /api/books/[id]/content/generate` | `content_assets.text_content` + metadata |
| Content generation image | Stub image provider (default) | In-process | API route (synkront) | `POST /api/books/[id]/content/generate` | `content_assets.asset_url` |
| Trailer prompt generation | Stub/Ollama copywriter | In-process HTTP | API route (synkront) | `POST /api/books/[id]/trailer/generate`, `POST /api/marketing/trailer/generate-prompt` | Response + metadata (och i build-flöde in i `media_assets`) |
| Recommendations | Heuristik/SQL (ingen ML-modell) | TS/DB | recommendations worker + API fallback route | onboarding/scheduled/manual + `/api/recommendations/for-you` | tabell `recommendations` (precompute) eller direkt API-response |

### 3.2 Embeddings / moderation

- Embeddings-pipeline: ingen explicit embeddings/vector-infrastruktur hittad i runtime-kod.
- Moderation-pipeline: ingen modellbaserad moderation funnen; moderation nämns primärt som admin/workflow-funktion, inte AI-pipeline.

### 3.3 Synkrona vs asynkrona AI-flöden

Asynkrona AI-flöden (queue/worker):
- translation (Opus MT)
- audiobook generation (Qwen/OpenAI)

Synkrona AI-flöden (direkt i API):
- trailer prompt generation
- marketing/content text/image/video generation
- text-to-video

---

## 4. Data layer

### 4.1 Databas

- Primär databas: Supabase Postgres
- Auth: Supabase Auth (`auth.users`)
- Applikationsprofil: `public.profiles`
- RLS används brett i migrations

### 4.2 Schema-läge

Canonical i praktiken:
- `apps/web/supabase/migrations`

Legacy/sekundär:
- `packages/db/supabase/migrations`

Observation:
- Dubbel migrationshistoria finns kvar och skapar kognitiv/operativ risk.

### 4.3 Viktiga tabeller per domän

Auth/användare:
- `profiles`
- `notifications`
- `follows`, `comments`, `messages`, `book_clubs`, `polls` m.fl.

Bokdomän:
- `books`
- `book_versions`
- `chapters`
- `book_imports`
- `translations` (legacy/minimal länkmodell)

AI/job tracking:
- `ai_jobs`
- `tts_preview_jobs`
- `chapter_audio_cache`
- `audiobook_assets`
- `content_assets`
- `media_assets`
- `marketing_assets`, `marketing_campaigns`, `marketing_caption_cache`

Recommendations/discovery:
- `genres`
- `book_genres`
- `reader_genre_preferences`
- `reader_book_signals`
- `recommendations`

Billing/payments:
- `billing_accounts`
- `billing_plan_catalog`
- `stripe_events`
- `orders`, `entitlements`, `user_credits`, `credit_topups`, `credit_grants`
- `user_usage_monthly`

Social integration:
- `social_connections`
- `social_connections_safe` (view)

### 4.4 Relationer (förenklad)

- `books.author_id -> auth.users.id`
- `book_versions.book_id -> books.id`
- `chapters.book_version_id -> book_versions.id`
- `book_imports.book_id -> books.id`
- `ai_jobs.book_id -> books.id`
- `audiobook_assets.book_id -> books.id`
- `media_assets.book_id -> books.id`
- `content_assets.book_id -> books.id`
- `book_genres.book_id -> books.id`, `book_genres.genre_id -> genres.id`
- `recommendations.user_id -> auth.users.id`, `recommendations.book_id -> books.id`

### 4.5 Storage

Observerade buckets i migrationer/runtime:
- `book_covers`
- `audiobooks` (privat i senare migration)
- `tts-outputs`
- `tts_previews`
- `content-assets`
- `marketing-media`
- `book-imports` (används i runtime när bucket finns, annars lokal fallback)

---

## 5. Worker system

### 5.1 Queue-topologi (BullMQ)

| Queue | Producer | Worker | Jobtyp |
|---|---|---|---|
| `book-import-extract` | import API routes/scoped import | `import-worker.ts` | `extract` |
| `book-translation` | translate API + auto-enqueue import-worker | `translation-worker.ts` | `translate` |
| `audiobook-generation` | audiobook generate API | `audiobook-worker.ts` | `generate` |
| `social-publish` | social publish API | `social-publish-worker.ts` | `publish` |
| `marketing-campaign` | marketing schedule API | `marketing-worker.ts` | `marketing-generate` |
| `recommendations` | reader onboarding + worker scheduler | `recommendations-worker.ts` | `compute` |
| `notifications` | (queue definierad) | `notifications-worker.ts` | notification delivery |

### 5.2 Retry/backoff/concurrency

| Queue | attempts/backoff | Worker concurrency | Stall/lock-strategi |
|---|---|---:|---|
| import | 2 / exp 2s | 3 | stalledInterval 30s, maxStalledCount 2 |
| translation | 3 / exp 5s | 2 | stalledInterval 30s, maxStalledCount 2 |
| audiobook | 3 / exp 10s | `TTS_CONCURRENCY` (default 1) | stalledInterval 120s, lockDuration 3660s, maxStalledCount 2 |
| social publish | 2 / exp 5s | 2 | stalledInterval 120s, lockDuration 300s, maxStalledCount 2 |
| marketing | 2 / exp 5s | 2 | stalledInterval 30s, maxStalledCount 2 |
| recommendations | 2 / exp 5s | 4 | stalledInterval 60s, lockDuration 120s, maxStalledCount 2 |
| notifications | (ej tydligt i queuefil) | 10 | enkel worker-konfig |

### 5.3 Övriga worker-processer

- `tts-preview-worker.ts`: ingen BullMQ, pollar `tts_preview_jobs` var 2 sek.
- `combined-worker.ts`: startar flera workers tillsammans (wrapper).
- `apps/worker`: separat app, men i praktiken tunn wrapper runt import-worker från `apps/web`.

### 5.4 Statusrapportering till frontend

Primärt via tabeller:
- Import: `book_imports.status/progress/error_message`
- Translation: `book_versions.status`
- Audiobook/social: `ai_jobs.status/progress/output/error`
- TTS preview: `tts_preview_jobs.status/progress/audio_path/error`

Primära status-endpoints:
- `/api/books/[id]/jobs` (unifierar import + translation + audiobook)
- `/api/tts/qwen/preview/status`
- `/api/notifications/*`

Frontenduppdatering:
- polling-hooks (`useBookJobs`, `useNotifications`, TTS-lab page polling)

---

## 6. Deployment

### 6.1 Nuvarande setup

Web:
- Vercel-konfig i `apps/web/vercel.json`
- Build/install körs från repo-root

Infra i repo:
- Endast Redis compose för lokal drift (`docker-compose.yml`, `infra/docker/docker-compose.yml`)

Workers:
- Körs som separata Node-processer via npm scripts
- Ingen explicit prod-orchestrering i repo (ingen Dockerfile/K8s/Terraform/Procfile)

### 6.2 Dev environment

Typisk lokal stack:
1. `docker compose up -d` (Redis)
2. `npm run dev` (Next app)
3. en eller flera worker-processer (`import`, `translate`, `audiobook`, etc.)

### 6.3 Production environment (inferens från repo)

- Web app: sannolikt Vercel
- Supabase: managed
- Redis: extern managed instans (prod-env-exempel visar Upstash-liknande URL)
- Worker runtime: extern processhost krävs men är inte kodifierad i repo

### 6.4 Miljövariabler (kritiska grupper)

Kärna:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `REDIS_URL`

AI:
- `HF_CREDENTIALS`
- `OPUSMT_PYTHON`, `OPUSMT_MODELS_DIR`
- `TTS_PROVIDER`, `QWEN_TTS_*`, `OPENAI_API_KEY`, `OPENAI_TTS_MODEL`
- `AI_COPYWRITER_PROVIDER`, `AI_OLLAMA_MODEL`, `OLLAMA_BASE_URL`

Payments/notifications:
- `STRIPE_*`, `PRICE_PLUS`, `PRICE_PRO`
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`

Social:
- `SOCIAL_TOKEN_KEY`, `SOCIAL_OAUTH_STATE_SECRET`
- `X_*`, `TIKTOK_*`, `INSTAGRAM_*`

### 6.5 Scaling-strategi (observerad)

Nuvarande implicit strategi:
- Single/få worker-instanser med lokal/in-memory skyddslogik (budget/rate-limit fallback)

Skalningsrisk:
- Budget-gating i workers är processlokal memory-map; multi-instance kan överkonsumera budget.
- Ingen central, deklarativ worker-autoscaling i repo.

---

## 7. Code quality assessment

### HIGH risk

1. Produktionsdrift för workers är inte formaliserad i repo
- Web har tydlig Vercel-path, men worker-deployment saknar tydlig infrastrukturkod.
- Risk: miljö- och processdrift blir ad hoc.

2. Processlokal budget/rate-limit för kritiska AI-flöden
- `src/lib/workers/budget.ts` dokumenterar själv begränsningen.
- Vid horisontell skalning blir budgetkontroll inkonsistent.

3. Synkrona, tunga AI-anrop i API-routes
- Flera marketing/trailer/video-flöden kör hela kedjan direkt i request-path.
- Risk: timeouts, varierande latens och högre felpåverkan i API-lagret.

4. Migration split och schema-drift
- Både `apps/web/supabase/migrations` och `packages/db/supabase/migrations` används som historiska källor.
- Risk: onboarding-friktion och schema-missmatch mellan miljöer.

### MEDIUM risk

1. Dokumentationsdrift mot kod
- Exempel: äldre docs nämner Runway eller saknade workers trots aktuell Higgsfield/social/recommendations implementation.
- Exempel: root-README nämner `npm run marketing-worker`, men root-script saknas.

2. Dubbla/partiella queue-abstraktioner
- Generisk queue-factory/descriptors finns, men specialiserade queue-filer används parallellt.
- Risk: divergent beteende och underhållsfriktion.

3. Blandad status- och resultatmodell över flera tabeller
- Jobs/status sprids över `book_imports`, `book_versions`, `ai_jobs`, `tts_preview_jobs`, `marketing_campaigns`, `media_assets`.
- Komplexitet är hanterbar men kräver fortsatt disciplin i kontrakt.

4. Begränsad hälsokontroll
- `/api/health/queue` verifierar främst Redis + translation queue, inte full worker-matris.

### LOW risk

1. Legacy artefakter
- `packages/db` innehåller legacy migrationer/referenser som inte är primär driftväg.

2. Delvis överlappande worker-ingångar
- `apps/worker` duplicerar delar av `apps/web/scripts`-ansvaret som wrapper.

3. Små inkonsekvenser i runbooks/kommandon
- Påverkar främst onboarding, inte kärnfunktion direkt.

---

## 8. Documentation review

### 8.1 Dokument som finns

- `README.md`
- `docs/ARCHITECTURE_MAP.md`
- `docs/PROJECT_ANALYSIS.md`
- `docs/route-map.md`
- `docs/dev-runbook.md`
- `docs/workers-runbook.md`
- `docs/workers-local.md`
- `docs/RUNBOOK_LOCAL.md`
- `docs/LOCAL_SUPABASE_MIGRATIONS.md`
- `docs/SCHEMA_GAPS.md`
- `docs/mvp.md`
- `apps/web/SUPABASE_TYPES.md`

### 8.2 Bedömning för ny utvecklare

Styrkor:
- Bra mängd runbooks och domändokument.
- Tydlig lokalstart för Redis + workers.
- Route-map och architecture-map ger snabb överblick.

Svagheter:
- Flera dokument är delvis inaktuella mot nuvarande kod.
- Ingen enhetlig, uppdaterad “source of truth” för prod worker deployment.
- Schema-gap-dokumentation är delvis föråldrad efter senare migrationer.

Samlad onboarding-bedömning:
- Förståbarhet: medel
- Operativ tydlighet: medel/låg

### 8.3 Vad som saknas

- En canonical “production architecture + deployment runbook” för web + alla workers.
- En uppdaterad env-matris per tjänst (web, varje worker, social, AI).
- Enhetlig dokumentation för vilka flows som är sync vs async.
- Tydlig policy för docs-freshness (owner + uppdateringskrav vid feature-merge).

---

## 9. Current status

### 9.1 Hur nära stabilt MVP

Teknisk bedömning:
- Feature-MVP: relativt nära (ca 75–85%)
- Drift-MVP: lägre mognad (ca 50–60%)

### 9.2 Vad fungerar redan

- End-to-end import -> kapitelpersistens
- Översättningspipeline via BullMQ + Opus MT
- Ljudboksgenerering med job tracking och storage-manifest
- Reader/author-appar med bred route-yta
- Rekommendationer (både precompute-worker och synk API-fallback)
- Social publish-queue med OAuth/tokenhantering
- Marketing video/trailer-flöden med Higgsfield-integration

### 9.3 Vad är halvfärdigt / ojämnt

- Notifications queue finns men huvudsakligt mönster är DB-direkt notifications.
- `apps/worker` är smal wrapper snarare än full worker-runtime.
- Flera AI-marketingflöden är API-synkrona istället för robust köade pipelines.
- Dokumentationsspår och migrationsspår är inte helt konsoliderade.

### 9.4 Vad saknas

- Embeddings/vector-baserad rekommendationsinfrastruktur.
- Modellbaserad moderation pipeline.
- Tydlig, deklarativ produktionsdrift för workers (infra-as-code/process manager).
- Full observability-stack för queue/workers (metrics, alerts, DLQ-dashboard).

---

## 10. Prioritized roadmap

### KRITISKT för MVP

1. Fastställ och dokumentera canonical prod-deployment för samtliga workers.
2. Konsolidera migrationssanning (primär mapp + avvecklingsplan för legacy-spår).
3. Minska docs-drift: uppdatera arkitektur/runbooks så de matchar faktisk kod (Higgsfield, worker scripts, queue-status).
4. Inför robust global budget/rate-limit för AI-jobs (Redis-baserad counter, inte in-memory).
5. Definiera ett enhetligt job status-kontrakt över alla pipelines.

### VIKTIGT innan scaling

1. Flytta långa AI-flöden från synk API till asynk queue där lämpligt (video/trailer/content-generation).
2. Inför central worker-health/metrics per queue + larm.
3. Standardisera queue-abstraktion (antingen generic factory eller queue-specifika implementationer, inte båda).
4. Dokumentera och testa multi-instance-beteende för dedupe/retries/budget.
5. Tydliggör ansvar mellan `apps/web/scripts` och `apps/worker`.

### NICE TO HAVE

1. Embeddings-baserad recommendations-lane som komplement till heuristik.
2. Moderation-pipeline för user generated content.
3. Konsoliderad developer-portal-doc med auto-genererad route/queue/schema-översikt.
4. Förbättrad smoke-testautomation för hela `frontend -> queue -> worker -> storage`.
5. Teknikskuldstädning i legacy dokument och migreringar.

---

## Appendix A: Frontend -> API -> Queue -> Worker -> Storage -> Frontend (konkret)

### Import/translation
1. Frontend laddar fil via import-API.
2. API skapar `book_imports` + lagrar fil + enqueue `book-import-extract`.
3. `import-worker` extraherar och skriver `books/book_versions/chapters`.
4. Ev. auto-enqueue translation-jobb (`book-translation`).
5. `translation-worker` skriver översatt `book_versions/chapters`.
6. Frontend pollar `/api/books/[id]/jobs` och uppdaterar UI.

### Audiobook
1. Frontend anropar `/api/books/[id]/audiobook/generate`.
2. API skapar `ai_jobs` och enqueue `audiobook-generation`.
3. `audiobook-worker` synthar kapitel, cachear i `chapter_audio_cache`, lagrar i `audiobooks` bucket, skapar `audiobook_assets`.
4. Frontend pollar `/api/books/[id]/jobs` och får signed URLs/manifestdata.

### TTS lab
1. Frontend skapar jobb via `/api/tts/qwen/preview`.
2. API skriver `tts_preview_jobs` (ingen Redis).
3. `tts-preview-worker` pollar tabellen, synthar, laddar upp till `tts_previews`.
4. Frontend pollar `/api/tts/qwen/preview/status` tills `succeeded`.

### Marketing/trailer (nuvarande)
1. Frontend anropar API-route.
2. API kör AI-kedja direkt (copywriter/higgsfield/ffmpeg beroende på endpoint).
3. Output skrivs till `content_assets` eller `media_assets` och ibland storage-bucket.
4. Frontend får resultat i samma request (eller läser status/data från tabell/endpoint).

## Appendix B: Kort QA-script (6 steg)

1. Starta Redis: `docker compose up -d`.
2. Starta web: `npm run dev`.
3. Starta workers: `npm run import-worker`, `npm run translate-worker`, `npm run audiobook-worker`.
4. Testa import i UI och verifiera status i `/api/books/[id]/jobs`.
5. Kör translation + audiobook och verifiera att assets/status uppdateras i UI.
6. Öppna `/author/tts-lab`, skapa preview-jobb, verifiera `queued -> running -> succeeded`.
