# Performance Bottleneck Audit — 2026-04-02

## Summary: 3 CRITICAL, 16 HIGH, 15 MEDIUM, 5 LOW

## CRITICAL

1. **Shelves N+1** — fallback path: 3 queries per shelf (300-600ms for 10 shelves) — `lib/supabase/shelves.ts:51-77`
2. **Shelf reorder N+1** — 1 UPDATE per item (20 items = 20 trips) — `lib/supabase/shelves.ts:235-274`
3. **Revenue stats sequential** — 3 independent queries in series — `api/author/stats/revenue/route.ts`

## HIGH

### DB / Queries
- Reader home: 7+ sequential query stages (200-400ms) — `reader/home/page.tsx`
- Reader home: avatar resolution per author N+1 (50-150ms) — `reader/home/page.tsx:464`
- Book detail: sequential queries that could be parallel (150-250ms) — `reader/books/[id]/page.tsx`
- Chapter read: analytics write blocks rendering (100-200ms) — `reader/read/[chapterId]/page.tsx`
- `getReadAccess()` redundantly fetches chapters (30-60ms) — `lib/books/access.ts`
- Recommendations: full table scan 200 rows x 5 seeds (200-500ms) — `lib/recommendations/scoring.ts`
- `select("*")` in 7+ files — fetches entire rows for 2-3 columns — various
- `loadBookWorkspaceData`: 6 sequential queries (200-300ms) — `author/books/[id]/loadBookWorkspaceData.ts`

### Client / Bundle
- `unoptimized` on 30+ Image components — 3-10x image bandwidth — various
- Reader home missing Suspense — 8+ queries block all HTML — `reader/home/page.tsx`
- TiptapRenderer loads full editor (~100KB+) for read-only — `components/editor/TiptapRenderer.tsx`

### API / Infra
- Redis connection churn — heartbeat/health create+destroy per call — `lib/health/worker-heartbeat.ts`
- No BullMQ worker concurrency — default 1 — worker configs
- Only 2 API routes have Cache-Control — CDN/browser can't cache — various
- Notifications unread-count: COUNT(*) with no cache — `api/notifications/unread-count/route.ts`
- Analytics full-table scan in stats/books — `api/author/stats/books/route.ts`

## MEDIUM

- Sequential queries on: author profile, library, audience, production pages
- `getLatestMessageByConversationId` unbounded — all messages without .limit()
- Missing indexes: books.language, books.title (trigram), readings.book_id
- Missing ISR on book detail + author profile pages
- AuthorWorkspaceProvider: new context value on every navigation
- Konva static import, GlassSurface SVG filter on every page
- Duplicated queue singleton in 5 files, no stale job cleanup
- Rate limiter in-memory Map never pruned (memory leak)

## Quick wins implemented

- [ ] Promise.all in 8 page.tsx files
- [ ] Remove `unoptimized` from Image components
- [ ] Cache-Control headers on read-heavy endpoints
- [ ] Reuse Redis connection in heartbeat/health
- [ ] Fire-and-forget analytics logging
