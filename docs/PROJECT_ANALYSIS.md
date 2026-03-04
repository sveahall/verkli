# PROJECT_ANALYSIS

## TLDR
1. Repo är en npm-workspace monorepo med huvudapp i `apps/web`.
2. Huvudstack: Next.js 16 + React 19 + TypeScript + Supabase + BullMQ/Redis.
3. API-ytan: ~120 API-routes; frontend har ~80 `page.tsx` routes.
4. Asynkron bearbetning finns för import, translation, audiobook, social publish, recommendations och marketing.
5. Databaslagret har primärt migrationsspår i `apps/web/supabase/migrations`.
6. Schema-drift finns: kod använder tabeller som saknar migration i repot (se `docs/SCHEMA_GAPS.md`).
7. Externa integrationer: Stripe, Supabase Auth/DB/Storage, Resend, Runway, X/TikTok/Instagram OAuth och lokal Qwen TTS.
8. Build-status: `npm run build` passerar (Turbopack).
9. Test-status: **676 gröna tester, 0 failures** (via `npm run qa:beta`).
10. Lint-status: **0 errors, 0 warnings**.
11. Quality gate: `npm run qa:beta` — 7 steg (env → tests → lint → english-default → no-placeholders → dead-code → build).

## Kvalitetssignal (senast verifierad 2026-03-04)
- `npm run qa:beta` → **ALL PASSED** (7/7 steg)
- 76 testfiler, 676 tester — alla gröna
- ESLint: 0 errors, 0 warnings
- TypeScript: `tsc --noEmit --noUnusedLocals --noUnusedParameters` — clean
- `next build` (Turbopack) — success, 126 statiska sidor

## Stack
- Next.js `^16.1.6`, React `19.2.3`, TypeScript `^5`
- Supabase JS + SSR (auth, postgres, storage)
- BullMQ + ioredis (queue/worker)
- Tailwind CSS
- Vitest (tester), ESLint 9 (lint)
- Stripe (billing/payments), Resend (email), Runway (video)

## Asynkrona Flöden (Workers)
| Queue | Worker | npm script |
|---|---|---|
| `book-import-extract` | `scripts/import-worker.ts` | `npm run import-worker` |
| `book-translation` | `scripts/translation-worker.ts` | `npm run translate-worker` |
| `audiobook-generation` | `scripts/audiobook-worker.ts` | `npm run audiobook-worker` |
| `social-publish` | `scripts/social-publish-worker.ts` | `npm run social-publish-worker` |
| `marketing-campaign` | `scripts/marketing-worker.ts` | `npm run marketing-worker` |
| `recommendations` | `scripts/recommendations-worker.ts` | manuell: `npx tsx scripts/recommendations-worker.ts` |

## Kända Luckor
- [ ] Schema-drift: runtime-tabeller saknar migrationer (se `docs/SCHEMA_GAPS.md`)
- [ ] `packages/db/supabase/migrations` är legacy — ej konsoliderat med primärspår
- [ ] `notifications` queue definierad men ingen worker finns
- [ ] Translation stöder primärt `sv↔en` via Opus MT
- [ ] In-memory rate-limit/budget resetas vid restart

## Policyer
- **English-first**: Reader/public sidor på engelska (CI-enforced via `check:english-default`)
- **Swedish i author dashboard**: Alla labels/UI på svenska
- **Supabase-only**: Ingen Prisma, ingen ORM
- **qa:beta gate krävs**: Alla 7 steg måste passera före release
