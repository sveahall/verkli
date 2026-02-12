# ARCHITECTURE_MAP

## TLDR
1. Systemets centrum är `apps/web` (Next.js app + API + queue producers).
2. Data går primärt till Supabase (Auth, Postgres, Storage).
3. Redis används som kö-backplane för BullMQ workers.
4. Sex worker-processer finns i kod (import, translation, audiobook, tts, social, recommendations).
5. Endast fyra workers har npm-scripts idag; två startas manuellt med `npx tsx`.
6. Betalning går via Stripe; email via Resend; video via Runway.
7. Translation och TTS är lokala provider-flöden (Opus MT/Piper) med starkt env-beroende.
8. Databasschemat är splittrat över två migrationsmappar och är inte helt synkat med runtime-kod.

## Översiktsdiagram
```mermaid
graph TD
  Browser["Web/Client"] --> Next["apps/web (Next.js)"]
  Next --> Auth["Supabase Auth"]
  Next --> DB["Supabase Postgres"]
  Next --> Storage["Supabase Storage"]
  Next --> Redis["Redis (BullMQ)"]

  Redis --> WImport["import-worker"]
  Redis --> WTrans["translation-worker"]
  Redis --> WAudio["audiobook-worker"]
  Redis --> WTTS["tts-worker"]
  Redis --> WSocial["social-publish-worker"]
  Redis --> WReco["recommendations-worker"]

  WImport --> DB
  WImport --> Storage
  WTrans --> DB
  WAudio --> DB
  WAudio --> Storage
  WTTS --> DB
  WTTS --> Storage
  WSocial --> DB
  WReco --> DB

  Next --> Stripe["Stripe API/Webhooks"]
  Next --> Resend["Resend API"]
  Next --> Runway["Runway API"]
  Next --> SocialAPIs["X/TikTok/Instagram OAuth APIs"]

  WSocial --> SocialAPIs
```

## Appar Och Paket

### Appar
| Komponent | Path | Huvudansvar |
|---|---|---|
| Web app | `apps/web` | Frontend, API routes, queue producers, worker scripts |
| Worker app | `apps/worker` | Import worker-wrapper som återanvänder `apps/web`-kod |

### Delade paket
| Paket | Path | Huvudansvar |
|---|---|---|
| Config | `packages/config` | Delad ESLint/TSConfig |
| Shared | `packages/shared` | Contracts/schemas/constants |
| UI | `packages/ui` | Delat UI-paket (stub idag) |
| DB | `packages/db` | Legacy migrations + db-stub |

## Databaser Och Storage

### Primära datakällor
| Resurs | Typ | Kommentar |
|---|---|---|
| Supabase Postgres | Databas | Primär runtime-databas |
| Supabase Auth | Identitet | Session och user context |
| Supabase Storage | Objektlagring | Covers/audio/content assets/importfiler |
| Redis | Queue state | BullMQ jobs, retries, dedupe state |

### Migrationskällor
| Källa | Path | Status |
|---|---|---|
| Primär | `apps/web/supabase/migrations` | Aktiv för nuvarande app |
| Sekundär/legacy | `packages/db/supabase/migrations` | Delvis överlapp, ej konsoliderad |

### Storage buckets i migrationer
- `book_covers`
- `audiobooks`
- `tts-outputs`
- `content-assets`

### Storage bucket i runtimekod
- `book-imports` (används av import-flödet)

## Queue Och Worker Karta
| Queue | Producer (API/lib) | Worker | Output/tabeller |
|---|---|---|---|
| `book-import-extract` | import routes + scoped import lib | `scripts/import-worker.ts` | `book_imports`, `books`, `book_versions`, `chapters` |
| `book-translation` | translate route + auto-enqueue i import worker | `scripts/translation-worker.ts` | `book_versions`, `chapters` |
| `audiobook-generation` | audiobook generate route | `scripts/audiobook-worker.ts` | `ai_jobs`, `audiobook_assets`, `chapter_audio_cache`, storage |
| `tts-generation` | tts job path | `scripts/tts-worker.ts` | `ai_jobs`, `audiobook_assets`, storage |
| `social-publish` | social publish route | `scripts/social-publish-worker.ts` | `ai_jobs`, `marketing_campaigns` |
| `recommendations` | recommendations queue + intern scheduler | `scripts/recommendations-worker.ts` | `recommendations` |
| `notifications` | definierad i queue names | saknas worker | ej aktiv queue-flow i kod |

## Route Domäner (Översikt)
| Domän | Frontend routes | API routes |
|---|---|---|
| Auth | `/author/*auth`, `/reader/*auth`, `/auth/reset-password` | `/api/auth/active-role`, `/api/author-applications`, `/api/admin/author-applications`, `/auth/callback` |
| Author app | `/author/home`, `/author/books`, `/author/publish`, `/author/stats`, `/author/marketing` | `/api/author/stats*`, `/api/books/[id]/*` |
| Reader app | `/reader/home`, `/reader/discover`, `/reader/books/[id]`, `/reader/read/[chapterId]` | bookmarks, comments, follows, reviews, clubs, polls, notifications |
| Billing | account billing pages | `/api/billing/*`, `/api/stripe/webhook`, `/api/books/[id]/purchase/checkout`, `/api/donations/checkout`, `/api/credits/*` |
| Import/Translation/TTS | author book workflows | `/api/books/import*`, `/api/books/[id]/import`, `/api/books/[id]/translate*`, `/api/tts`, `/api/books/[id]/tts`, `/api/books/[id]/audiobook/*` |

## Tredjepart Och Integrationspunkter
| Tjänst | Funktion | Nycklar |
|---|---|---|
| Stripe | Checkout, subscriptions, webhook processing | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PRICE_PLUS`, `PRICE_PRO`, `STRIPE_*_URL` |
| Resend | Waitlist- och newsletter-utskick | `RESEND_API_KEY`, `RESEND_FROM_EMAIL` |
| Runway | Text-till-video | `RUNWAYML_API_SECRET` |
| X/TikTok/Instagram | OAuth connect + publish | `X_*`, `TIKTOK_*`, `INSTAGRAM_*` |
| Supabase | Auth, DB, Storage | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| Redis | Queue transport | `REDIS_URL` |
| Opus MT (lokal) | Translation provider | `OPUSMT_PYTHON`, `OPUSMT_MODELS_DIR` |
| Piper (lokal) | TTS provider | `TTS_*` variabler |

## Säkerhetsgränser
- API auth bygger på Supabase session från server client (`createClient`).
- Privilegierade operationer går via service-role client (`createAdminClient`).
- Author-gating använder DB-kontroller (`profiles.role` + `author_applications`) i middleware + route guards.
- Admin-endpoints kräver `x-admin-key` mot `ADMIN_API_KEY`.
- Social OAuth state signeras och valideras med `SOCIAL_OAUTH_STATE_SECRET`.
- Social tokens krypteras med `SOCIAL_TOKEN_KEY`.

## Kända Arkitekturluckor
- [ ] Databas-schema är inte en enda konsoliderad källa i repo.
- [ ] Vissa runtime-tabeller saknar migrationer i båda spåren (`social_connections`, `recommendations`, m.fl.).
- [ ] `notifications` queue är definierad men ingen worker hittad.
- [ ] Worker script-ytan är inkonsekvent (saknade npm scripts för social/recommendations).
