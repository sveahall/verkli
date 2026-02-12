# PROJECT_ANALYSIS

## TLDR
1. Repo är en npm-workspace monorepo med huvudapp i `apps/web` och en sekundär worker-app i `apps/worker`.
2. Huvudstack: Next.js 16 + React 19 + TypeScript + Supabase + BullMQ/Redis.
3. API-ytan är stor: 96 API-routes; frontend har 70 `page.tsx` routes.
4. Asynkron bearbetning finns för import, translation, audiobook, tts, social publish och recommendations.
5. Databaslagret är splittrat i två migrationsspår: `apps/web/supabase/migrations` och `packages/db/supabase/migrations`.
6. Schema-drift finns: kod använder tabeller som saknar migration i repot (t.ex. `social_connections`, `recommendations`, `book_genres`).
7. Externa integrationer: Stripe, Supabase Auth/DB/Storage, Resend, Runway, X/TikTok/Instagram OAuth, lokal Opus MT och lokal Piper TTS.
8. Build-status: `npm run -w @verkli/web build:ci` passerar, men med bundler-varningar kring `epub`-beroenden.
9. Test-status: 466 gröna, 17 röda tester (2 testfiler fallerar).
10. Lint-status: 6 errors + 84 warnings.
11. Befintlig dokumentation är delvis stale/motsägelsefull (README + runbooks + route-map).
12. Projektet är funktionellt men inte ännu en stabil “single source of truth” för schema, workers och release-gate.

## Scope Och Metod
- [x] Genomgång av repo-struktur (`apps`, `packages`, `docs`, scripts)
- [x] Inventering av stack, runtime, build/test/lint
- [x] Kartläggning av routes (auth/author/reader/billing/translation/tts/import)
- [x] Kartläggning av migrations, tabeller, triggers, RLS, views, functions
- [x] Kartläggning av queue/worker-flöden och env-krav
- [x] Kartläggning av externa tjänster + nycklar + kodanvändning
- [x] Verifiering via faktiska kommandon (`test`, `lint`, `build:ci`)

## Monorepo Karta

### Appar
| Path | Roll | Runtime |
|---|---|---|
| `apps/web` | Primär produktapp (frontend + API + workerscripts) | Next.js (Node.js runtime för API) |
| `apps/worker` | Sekundär worker-app (import), återanvänder kod från `apps/web/scripts/import-worker.ts` | Node.js/tsx |

### Paket
| Path | Roll | Status |
|---|---|---|
| `packages/config` | Delade config-exporter (eslint/tsconfig) | Aktiv |
| `packages/db` | Markerat som Supabase-only, men innehåller legacy migrations + Prisma-migrate script | Delvis legacy/stale |
| `packages/shared` | Delade contracts/schemas/constants | Aktiv men tunn |
| `packages/ui` | Delat UI-paket | I princip tom stub |

### Övrigt
| Path | Kommentar |
|---|---|
| `app/` | Tom i praktiken (ingen aktiv kod) |
| `docs/` | Många docs finns, men flera är delvis inaktuella |
| `docker-compose.yml` | Endast Redis (`redis:7` på port `6379`) |

## Teknisk Stack

### Runtime Och Ramverk
- Next.js `^16.1.6`
- React `19.2.3`
- TypeScript `^5`
- Node.js (workers, API node runtime)
- Supabase JS + Supabase SSR

### Buildsystem Och Monorepo
- Monorepo: npm workspaces (`apps/*`, `packages/*`)
- Build: `next build` och CI-variant `next build --webpack`
- Ingen Turborepo/Nx-konfiguration; workspace orchestration sker via npm scripts

### Test/Lint
- Test: Vitest (`vitest run`)
- Lint: ESLint 9

### Kö/Asynkron Infrastruktur
- BullMQ + ioredis
- Redis via `REDIS_URL` (lokalt via docker compose)

## Routekarta (Fokusdomäner)

### Auth
- API:
- `POST /api/auth/active-role` (`apps/web/src/app/api/auth/active-role/route.ts`)
- `GET|POST /api/author-applications` (`apps/web/src/app/api/author-applications/route.ts`)
- `GET|PATCH /api/admin/author-applications` (kräver `x-admin-key`)
- Callback:
- `GET /auth/callback` (`apps/web/src/app/auth/callback/route.ts`)
- Frontend auth-sidor:
- `/author/signin`, `/author/signup`, `/author/forgot-password`
- `/reader/signin`, `/reader/signup`, `/reader/forgot-password`
- `/auth/reset-password`

### Author
- App-routes:
- `/author/home`, `/author/books`, `/author/books/[id]`, `/author/publish`, `/author/stats`, `/author/marketing`, `/author/newsletters`, `/author/polls`, `/author/inbox`, `/author/settings`
- API-exempel:
- `GET /api/author/stats`
- `GET /api/author/stats/books`
- `GET /api/author/stats/revenue`

### Reader
- App-routes:
- `/reader/home`, `/reader/feed`, `/reader/discover`, `/reader/books/[id]`, `/reader/read/[chapterId]`, `/reader/library`, `/reader/bookmarks`, `/reader/community`, `/reader/clubs`, `/reader/inbox`, `/reader/settings`
- API-exempel:
- `GET /api/recommendations/for-you`
- `GET|POST /api/bookmarks`
- `GET|POST /api/polls` + vote/results routes
- `GET|POST /api/book-clubs` + join/leave/messages

### Billing/Payments
- `POST /api/billing/checkout`
- `POST /api/billing/portal`
- `GET /api/billing/state`
- `POST /api/stripe/webhook`
- `POST /api/books/[id]/purchase/checkout`
- `POST /api/donations/checkout`
- `POST /api/donation/checkout` (alias)
- `POST /api/credits/checkout`
- `GET /api/credits/balance`

### Import
- `POST /api/books/import`
- `POST /api/books/[id]/import`
- `GET /api/books/imports`
- `GET|POST /api/books/imports/[id]` (POST = retry failed import)

### Translation
- `POST /api/books/[id]/translate`
- `GET /api/books/[id]/translation-status`
- `GET /api/books/[id]/translations`

### TTS/Audiobook
- `POST /api/tts`
- `POST /api/books/[id]/tts`
- `POST /api/books/[id]/audiobook/generate`
- `GET /api/books/[id]/audiobook/status`
- `GET /api/books/[id]/jobs`

## Middleware Och Accessmodell
- Fil: `apps/web/middleware.ts`
- Gate 1: `NEXT_PUBLIC_WAITLIST_ONLY=true` låser allt utom waitlist + tillåtna assets/api
- Gate 2: `BETA_LOCK=true` låser till beta-användare (`user_flags.beta_enabled`)
- Accesskontroll:
- `/author/*` kräver auth + author approval (DB-baserat, inte user metadata)
- `/reader/*` har public browse-undantag (`/reader/books/*`, `/reader/read/*`, `/reader/discover`, `/reader/authors/*`)

## Databas-Kartläggning

### Migrationsspår
- Primärt spår: `apps/web/supabase/migrations` (45 filer)
- Sekundärt/legacy spår: `packages/db/supabase/migrations` (inkl. `profiles`, `shelves`, `newsletters`, `notifications`)

### Objektstatus (repo-observerad)
- Tabeller skapade i migrationer (båda spår sammanlagt): 56
- Tabeller använda i appkod (`from("...")`): 62
- Tabeller i kod men utan migration i repo: 8
- `avatars`
- `book_genres`
- `genres`
- `reader_book_signals`
- `reader_genre_preferences`
- `recommendations`
- `social_connections`
- `social_connections_safe`
- Funktioner i `apps/web` migrations: 11
- Triggers i `apps/web` migrations: 16
- Views i `apps/web` migrations: `job_status_view`
- `CREATE POLICY` i `apps/web` migrations: 132

### Feature → Tabeller (praktisk mapping)

#### Core content/authoring
- `books`, `book_versions`, `chapters`, `book_imports`, `translations`

#### AI/job pipeline
- `ai_jobs`, `audiobook_assets`, `chapter_audio_cache`, `content_assets`

#### Billing/commerce
- `billing_accounts`, `stripe_events`, `orders`, `entitlements`, `donations`, `credit_topups`, `credit_grants`, `user_credits`, `referral_codes`, `referral_redemptions`

#### Reader/discovery
- `bookmarks`, `readings`, `highlights`, `offline_manifests`, `curated_lists`, `curated_list_items`, `author_followers`

#### Community/social
- `comments`, `follows`, `reviews`, `conversations`, `conversation_participants`, `messages`, `message_user_blocks`, `dm_sender_rate_limits`, `book_clubs`, `book_club_members`, `book_club_messages`, `polls`, `poll_options`, `poll_votes`

#### Growth/admin/feedback
- `waitlist`, `reader_waitlist`, `author_applications`, `feedback`, `user_flags`, `analytics_events`

#### Legacy/core profile structures (i `packages/db` migrations)
- `profiles`, `shelves`, `shelf_sections`, `shelf_books`, `notifications`, `newsletters`, `newsletter_subscriptions`

### Viktiga Functions/Triggers/Views
- Functions:
- `can_view_book`
- `grant_user_credits_once`
- `finalize_order_checkout_session`
- `finalize_donation_checkout_session`
- `finalize_credit_topup_checkout_session`
- `sync_conversation_participants`
- `touch_conversation_on_message_insert`
- `dm_consume_rate_limit`
- `refresh_book_audiobook_status`
- `sync_book_audiobook_status_from_assets`
- `update_updated_at_column`
- Triggers (urval):
- `update_books_updated_at`, `update_chapters_updated_at`, `update_book_versions_updated_at`
- `update_ai_jobs_updated_at`, `sync_book_audiobook_status_on_assets`
- `conversations_sync_participants`, `messages_touch_conversation`
- View:
- `job_status_view`

### Storage Buckets
Definierade i migrations:
- `book_covers`
- `audiobooks`
- `tts-outputs`
- `content-assets`

Kod använder även:
- `book-imports` (import storage fallback/check)

## Asynkrona Flöden

### Queue → Producer → Worker
| Queue | Producer (huvud) | Worker | Kommando |
|---|---|---|---|
| `book-import-extract` | `/api/books/import`, `/api/books/[id]/import`, retry endpoint | `apps/web/scripts/import-worker.ts` | `npm run import-worker` |
| `book-translation` | `/api/books/[id]/translate`, auto enqueue från import-worker | `apps/web/scripts/translation-worker.ts` | `npm run translate-worker` |
| `audiobook-generation` | `/api/books/[id]/audiobook/generate` | `apps/web/scripts/audiobook-worker.ts` | `npm run audiobook-worker` |
| `tts-generation` | TTS-job path via `ai_jobs` | `apps/web/scripts/tts-worker.ts` | `npm run tts-worker` |
| `social-publish` | `/api/social/publish` | `apps/web/scripts/social-publish-worker.ts` | `cd apps/web && npx tsx scripts/social-publish-worker.ts` |
| `recommendations` | intern scheduler i recommendations-worker | `apps/web/scripts/recommendations-worker.ts` | `cd apps/web && npx tsx scripts/recommendations-worker.ts` |

### Schedulers/Cron-liknande
- `recommendations-worker.ts` kör `setInterval` var 6:e timme och enqueuear `scheduled`-jobb.
- Ingen extern cron-konfig i repo.

### Observerad lucka
- `QUEUE_NAMES.NOTIFICATIONS` finns definierad men ingen queue-producer/worker hittades för notifications.

## Externa Tjänster Och Nycklar
| Tjänst | Nycklar/env | Var den används |
|---|---|---|
| Supabase Auth/DB | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | `src/lib/supabase/*`, API-routes, workers |
| Supabase Storage | `AUDIOBOOK_STORAGE_BUCKET`, `TTS_STORAGE_BUCKET`, `LOCAL_IMPORTS_DIR` | import, audiobook, tts, content assets |
| Redis/BullMQ | `REDIS_URL` | queue-libs + alla workers + `/api/health/queue` |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PRICE_PLUS`, `PRICE_PRO`, `STRIPE_*_URL` | billing routes + webhook + donations/credits/book purchase |
| Resend | `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | waitlist + newsletters |
| Runway | `RUNWAYML_API_SECRET` | `/api/ai/text-to-video`, `src/lib/ai/textToVideo.ts` |
| Social OAuth | `X_CLIENT_ID`, `X_CLIENT_SECRET`, `INSTAGRAM_CLIENT_ID`, `INSTAGRAM_CLIENT_SECRET`, `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `SOCIAL_OAUTH_STATE_SECRET`, `SOCIAL_TOKEN_KEY`, `SOCIAL_MOCK_MODE` | social connect/callback/publish + social worker |
| Translation (lokal) | `OPUSMT_PYTHON`, `OPUSMT_MODELS_DIR` | translation worker + `src/lib/opus.ts` |
| TTS (lokal) | `TTS_ENABLED`, `TTS_BIN`, `TTS_MODEL_PATH`, `TTS_CONFIG_PATH`, `TTS_DATA_DIR`, `TTS_TIMEOUT_MS`, `TTS_MAX_CHARS`, `TTS_MAX_CONCURRENCY`, `TTS_RATE_LIMIT_PER_MINUTE`, `TTS_API_TOKEN` | `/api/tts`, `/api/books/[id]/tts`, tts/audiobook workers |
| Admin API | `ADMIN_API_KEY` | `/api/admin/*` |

## Nulägesstatus Och Risker

### Faktisk kvalitetssignal (kört i denna analys)
- `npm run -w @verkli/web test` → FAIL
- 46 testfiler, 483 tester
- 17 tester röda
- Felområden:
- `apps/web/src/app/api/books/[id]/content/generate/security_content-generate.spec.ts` (`_rateLimiter._reset` undefined)
- `apps/web/src/lib/billing/beta-smoke.test.ts` (saknade dedikerade svenska felmeddelanden för flera keys)
- `npm run -w @verkli/web lint` → FAIL
- 6 errors, 84 warnings
- Blocker errors i:
- `apps/web/src/app/(app-author)/author/newsletters/[id]/page.tsx` (`<a>` istället för `Link`)
- `apps/web/src/app/api/_test-helpers/supabase.ts` (`no-explicit-any`)
- `apps/web/src/lib/i18n/use-translations.ts` (`react-hooks/set-state-in-effect`)
- `npm run -w @verkli/web build:ci` → PASS med warnings
- Bundler warnings kring `epub` dependency (`original-fs`, `zipfile`)

### Konkreta risker
- [ ] **Schema drift**: kodtabeller saknar migrationer i repo (`social_connections`, `recommendations`, `book_genres`, m.fl.).
- [ ] **Dubbel migration source**: både `apps/web/supabase/migrations` och `packages/db/supabase/migrations` används som dokumentation men endast första är kopplad till aktiv Supabase config.
- [ ] **Seed-konfig mismatch**: `apps/web/supabase/config.toml` pekar på `./seed.sql` som inte finns.
- [ ] **Script mismatch**: `apps/web` script `runway:text-to-video` pekar på saknad fil `src/lib/ai/runTextToVideo.ts`.
- [ ] **Worker script coverage**: social/recommendations workers finns men saknar npm scripts i `apps/web/package.json` och root `package.json`.
- [ ] **check:no-placeholders bug**: script kan skriva `Found placeholder phrase` men ändå returnera success.
- [ ] **Docs mismatch**:
- README säger både “ingen `/api/tts`” och dokumenterar samtidigt `/api/tts`.
- `docs/workers-runbook.md` beskriver queue-size från `/api/health/queue`, men route returnerar endast boolsk status.
- `docs/import-pipeline.md` beskriver translation via `translations` table, men runtime job-status ligger primärt i `book_versions`/`ai_jobs`.
- [ ] **Translation capability gap**: API accepterar flera språk (`en/es/fr/de/it/pt/sv`), men Opus provider stödjer explicit endast `sv->en` och `en->sv`.
- [ ] **In-memory limits**: rate-limit/budget/circuit-state är processlokalt och resetas vid restart.

## Where We Are Now
- [x] Kärnflöden för auth, import, billing, translation, audiobook och tts finns i kod.
- [x] Build pipeline kan producera release-artifact (`build:ci` passerar).
- [x] Flera feature-domäner är implementerade (polls, clubs, newsletters, social, referrals).
- [ ] Repo saknar konsoliderad, verifierbar databas-sanning för hela appen.
- [ ] Test/lint är inte gröna, vilket blockerar trygg release-gate.
- [ ] Operativ worker-runbook saknar scriptkonsistens för alla workers.

## Next 10 Steps
1. Konsolidera schema till ett migrationsspår (rekommenderat: `apps/web/supabase/migrations`) och markera `packages/db/supabase/migrations` som legacy/deprecated.
2. Skapa migrationer för saknade runtime-tabeller (`social_connections`, `social_connections_safe`, `recommendations`, `book_genres`, `genres`, `reader_genre_preferences`, `reader_book_signals`, `avatars`) eller ta bort kodberoenden.
3. Lägg till saknad `apps/web/supabase/seed.sql` eller stäng av seed i `config.toml`.
4. Fixa testsviten: börja med `_rateLimiter._reset` i content-generate security tests och translation fallback-key assertions i billing smoke test.
5. Fixa lint errors (6 blockerande) och därefter minska warnings med prioritet på hooks och auth/admin/testhelpers.
6. Lägg till npm-scripts för `social-publish-worker` och `recommendations-worker` i `apps/web/package.json` och root.
7. Rätta `runway:text-to-video` script till existerande fil eller skapa saknad CLI-fil.
8. Harmoniera docs med kod (README TTS-sektion, workers-runbook, import-pipeline, route-map).
9. Inför en pre-merge quality gate: `npm run -w @verkli/web test`, `npm run -w @verkli/web lint`, `npm run -w @verkli/web build:ci`.
10. Dokumentera och implementera distribuerad rate-limit/budget (Redis) för workers och dyra endpoints.

## Unknowns
- **Vilken databas-schema är faktisk prod-sanning?**
- Kör: `rg -n "create table" apps/web/supabase/migrations/*.sql packages/db/supabase/migrations/*.sql`
- Kör: `rg -n "from\(\"[a-z_]+\"" apps/web/src apps/web/scripts`
- **Finns saknade tabeller manuellt skapade i Supabase-projektet?**
- Kör (länkad miljö): `cd apps/web && npx supabase db pull --linked --schema public`
- Kör: `cd apps/web && npx supabase db diff --linked --schema public`
- **Är social/recommendations pipeline i aktiv drift?**
- Kör: `cd apps/web && npx tsx scripts/social-publish-worker.ts`
- Kör: `cd apps/web && npx tsx scripts/recommendations-worker.ts`
- Verifiera med API: `/api/social/publish/[jobId]/status` och DB `ai_jobs`.
- **Är local-supabase bootstrap reproducerbart med nuvarande config?**
- Kör: `cd apps/web && npx supabase start`
- Om seed-fel: verifiera `apps/web/supabase/config.toml` `[db.seed] sql_paths`.

## Kommandon Körda I Denna Analys
- Struktur/inventering: `ls -la`, `find`, `rg --files`, `cat`, `sed -n`, `wc -l`
- Script/runtime: `npm run`, `npm run -w @verkli/web`, `npm run -w @verkli/worker`
- Routekartläggning: `find apps/web/src/app/api -name 'route.ts'`, `find apps/web/src/app -name 'page.tsx'`
- DB-kartläggning: `rg -n -i "create table|create policy|create trigger|create or replace function|create view" ...`
- Kvalitet: `npm run -w @verkli/web test`, `npm run -w @verkli/web lint`, `npm run -w @verkli/web build:ci`, `npm run -w @verkli/web check:no-placeholders`
