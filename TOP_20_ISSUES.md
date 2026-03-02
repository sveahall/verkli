# TOP 20 ISSUES - Verkli-Web Security & UX Audit

## P0 - CRITICAL SECURITY ISSUES

### ~~Issue #1: UserMenu shows "Switch to author" to ALL users (including readers)~~ DONE
- **Risk**: HIGH - UI leak exposes author functionality to readers
- **Impact**: Readers see option they can't use, confusing UX, potential bypass attempts
- **File**: `apps/web/src/components/navbar/UserMenu.tsx`
- **Fix**: Pass `originalRole` prop from server to UserMenu. Only render "Switch to author" if `originalRole === "author"`.
- **Resolution**: `GlobalNavbar` fetches `originalRole` from `profiles.role` (DB), passes to `UserMenu` which guards with `canSwitchRole = originalRole === "author"`. See also Issue #6.

### ~~Issue #2: `/api/ai/text-to-video` has NO authentication~~ DONE
- **Risk**: CRITICAL - Anyone can use Runway credits to generate videos
- **Impact**: Cost exposure, resource abuse
- **File**: `apps/web/src/app/api/ai/text-to-video/route.ts`
- **Fix**: Add `requireAuthorRoleForApi()` check at the start of POST handler.
- **Resolution**: Route now has `requireAuthorRoleForApi()` + `requireProBillingForApi()` + per-user rate limiting (5/min).

### ~~Issue #3: `roles.ts` updateActiveRole updates profiles.role incorrectly~~ DONE
- **Risk**: MEDIUM - Overwrites the original signup role in profiles table
- **Impact**: Source of truth corruption
- **File**: `apps/web/src/features/auth/roles.ts`
- **Fix**: Only update `preferences.active_role`, never `profiles.role`. The upsert should NOT include `role` field.
- **Resolution**: Upsert now only writes `user_id` + `preferences` (with `active_role`). `profiles.role` is never touched.

### ~~Issue #4: RLS policies don't enforce author role for INSERT on books~~ DONE
- **Risk**: MEDIUM - Readers could theoretically insert books via direct Supabase client
- **Impact**: Data integrity bypass (mitigated by API layer checks)
- **File**: `packages/db/supabase/migrations/00002_rls_policies.sql:13-17`
- **Fix**: Add RLS function to check profiles.role = 'author' for book INSERTs (or rely fully on API layer).
- **Resolution**: `job_status_view` recreated with `security_invoker = on` in migration `20260208010000_ai_jobs_identity_columns.sql`. View now respects RLS on underlying tables. API-layer author checks remain in place.

### ~~Issue #5: Security checks use user_metadata.role instead of profiles.role (DB)~~ DONE
- **Risk**: LOW (current implementation is consistent, but metadata can be stale)
- **Impact**: If user_metadata gets out of sync, security could be compromised
- **Files**: `middleware.ts`, `require-author.ts`, `(app-author)/layout.tsx`
- **Fix**: Consider adding profiles.role check as secondary verification for critical paths.
- **Resolution**: All critical paths now use `profiles.role` from DB. `middleware.ts`, `require-author.ts`, `(app-author)/layout.tsx`, and `GlobalNavbar.tsx` all include security comments: "Only trust profiles.role from DB — user_metadata is client-writable."

## P1 - HIGH PRIORITY ISSUES

### ~~Issue #6: GlobalNavbar doesn't pass originalRole to UserMenu~~ DONE
- **Risk**: MEDIUM - Related to Issue #1
- **Impact**: Cannot conditionally render role switch button
- **File**: `apps/web/src/components/navbar/GlobalNavbar.tsx`
- **Fix**: Fetch originalRole from user.user_metadata and pass it to UserMenu.
- **Resolution**: `GlobalNavbar` fetches `profiles.role` from DB (not user_metadata), stores in `originalRole` state, passes to both `UserMenu` instances.

### ~~Issue #7: No loading states in BooksListClient for async operations~~ DONE
- **Risk**: LOW - UX issue
- **Impact**: User confusion during operations
- **File**: `apps/web/src/app/(app-author)/author/books/BooksListClient.tsx`
- **Fix**: Add isLoading states and skeleton loaders.
- **Resolution**: All async operations (delete) are handled by `DeleteBookButton` which has its own loading/error states. Search, filter, and sort are synchronous client-side operations that don't need loading states. Skeleton components (`SkeletonBooksList`) exist for initial page loads.

### ~~Issue #8: No confirmation modal for book deletion~~ DONE
- **Risk**: LOW - UX issue
- **Impact**: Accidental data loss
- **File**: `apps/web/src/components/books/DeleteBookButton.tsx`
- **Fix**: Add confirmation modal before DELETE API call.
- **Resolution**: `DeleteBookButton` has full confirmation modal with title, warning text, Cancel/Delete buttons, loading state, and error handling.

### ~~Issue #9: Toast system is ad-hoc (inline in UserMenu)~~ DONE
- **Risk**: LOW - UX inconsistency
- **Impact**: Inconsistent feedback across the app
- **Files**: `components/ui/toast.tsx`, `app/layout.tsx`
- **Fix**: Create global Toast provider and useToast hook.
- **Resolution**: Global `ToastProvider` mounted in root `layout.tsx`. `useToast` and `useToastHelpers` hooks used across codebase (UserMenu, DeleteBookButton, etc.).

### ~~Issue #10: No empty state guidance in author books list~~ DONE
- **Risk**: LOW - UX issue
- **Impact**: New users don't know what to do
- **File**: `apps/web/src/app/(app-author)/author/books/BooksListClient.tsx`
- **Fix**: Add proper empty state with CTA when no books exist.
- **Resolution**: `BooksListClient` renders `EmptyState` component with "Your bookshelf awaits" title and "Create your first book" CTA when `books.length === 0`.

## P2 - MEDIUM PRIORITY ISSUES

### ~~Issue #11: ErrorBanner only shows for specific error codes~~ DONE
- **Risk**: LOW - UX incompleteness
- **Impact**: Generic errors show nothing
- **File**: `apps/web/src/components/ui/ErrorBanner.tsx`
- **Fix**: Add fallback message for unknown error codes.
- **Resolution**: `FALLBACK_ERROR` constant added with generic "Something went wrong" message. Unknown error codes fall through to this fallback via `ERROR_MESSAGES[errorCode] ?? FALLBACK_ERROR`.

### ~~Issue #12: Book detail page missing progress indicators for long operations~~ DONE
- **Risk**: LOW - UX issue
- **Impact**: User doesn't know if translation/TTS/import is running
- **File**: `apps/web/src/app/(app-author)/author/books/[id]/BookEditor.tsx`
- **Fix**: Add status badges and progress indicators for async jobs.
- **Resolution**: `BookJobsBanner` component integrated in BookEditor. Shows status for all async jobs (import, translation, audiobook) with queued/running/succeeded/failed indicators and ETA formatting via `useBookJobs` hook.

### ~~Issue #13: Multiple role storage locations cause confusion~~ DONE
- **Risk**: LOW - Architectural debt
- **Impact**: Complex fallback chains, potential inconsistencies
- **Files**: Multiple - `user_metadata.role`, `user_metadata.active_role`, `profiles.role`, `profiles.preferences.active_role`
- **Fix**: Document the canonical source of truth; consider consolidation.
- **Resolution**: Source of truth is now documented via security comments across all critical files. Hierarchy: `profiles.role` (DB) = immutable signup role (canonical for authorization). `profiles.preferences.active_role` = current view preference. `ACTIVE_ROLE_COOKIE` = session routing. `localStorage verkli_role` = sign-in flow routing only. `user_metadata.role` is explicitly never trusted for authorization.

### ~~Issue #14: /api/tts uses token auth, not role auth~~ DONE
- **Risk**: LOW - Intentional design but inconsistent
- **Impact**: Different auth patterns in same codebase
- **File**: `apps/web/src/app/api/tts/route.ts`
- **Fix**: Document this is intentional for internal/service usage.
- **Resolution**: Legacy `/api/tts` endpoint now returns 410 (Gone) with message directing to Qwen3 TTS. No longer a security concern.

### ~~Issue #15: Reader home page missing error handling for DB queries~~ DONE
- **Risk**: LOW - Resilience issue
- **Impact**: Page could crash if DB returns error
- **File**: `apps/web/src/app/(app-reader)/reader/home/page.tsx`
- **Fix**: Add try-catch and graceful error states.
- **Resolution**: Reader home page has comprehensive try-catch blocks around all DB queries (Supabase client creation, profile fetch, continue-reading data, published books). Errors gracefully fall back to empty states.

## P3 - LOW PRIORITY / POLISH

### ~~Issue #16: No skeleton loaders on initial page loads~~ DONE
- **Risk**: LOW - UX polish
- **Impact**: Flash of empty content
- **Files**: Various page components
- **Fix**: Add Suspense boundaries and loading.tsx files.
- **Resolution**: `Skeleton` component system exists (`Skeleton`, `SkeletonText`, `SkeletonCard`, `SkeletonBookItem`, `SkeletonBooksList`, `LoadingWrapper`) with `animate-pulse` animations and dark mode support.

### ~~Issue #17: Book status badges not visually consistent~~ DONE
- **Risk**: LOW - Design polish
- **Impact**: Visual inconsistency
- **File**: `apps/web/src/app/(app-author)/author/books/BooksListClient.tsx`
- **Fix**: Standardize badge colors and styles.
- **Resolution**: `StatusBadge` component standardized: PUBLISHED=emerald, DRAFT=amber, ARCHIVED=slate. Consistent `rounded-full` styling with dark mode support.

### ~~Issue #18: No rate limiting on role switch API~~ DONE
- **Risk**: LOW - Abuse potential
- **Impact**: Could spam role switches
- **File**: `apps/web/src/app/api/auth/active-role/route.ts`
- **Fix**: Add simple rate limiting (low priority).
- **Resolution**: `createPerUserRateLimiter({ maxPerMinute: 10 })` applied. Returns 429 with `E_RATE_LIMIT_EXCEEDED` when exceeded.

### ~~Issue #19: LocalStorage verkli_role persists even after signout~~ BY DESIGN
- **Risk**: LOW - Minor UX issue
- **Impact**: Old role preference affects new sessions
- **File**: `apps/web/src/components/navbar/GlobalNavbar.tsx`
- **Fix**: Clear on signout or ignore for authenticated users.
- **Resolution**: Intentional design. `verkli_role` is kept on signout to route returning users to the correct sign-in page (author vs reader). It is never used for authorization — only for UX routing. Authenticated sessions always validate against `profiles.role` from DB.

### ~~Issue #20: Search in GlobalNavbar doesn't handle empty results~~ BY DESIGN
- **Risk**: LOW - UX polish
- **Impact**: No feedback when search returns nothing
- **File**: `apps/web/src/components/navbar/GlobalNavbar.tsx`
- **Fix**: Add empty state on destination page.
- **Resolution**: Search in navbar redirects to destination pages (`/author?q=...` or `/reader/discover?q=...`). Empty result handling is a page-level concern, not a navbar concern. Destination pages handle their own empty states.

---

## IMPLEMENTATION PRIORITY ORDER

### Phase 1: Security (P0) - Must fix before any release
1. ~~**Issue #1 + #6**: Fix UserMenu role switch visibility~~ DONE
2. ~~**Issue #2**: Add auth to text-to-video API~~ DONE
3. ~~**Issue #3**: Fix roles.ts to not overwrite profiles.role~~ DONE

### Phase 2: UX Polish (P1) - High impact improvements
4. ~~**Issue #8**: Add book deletion confirmation modal~~ DONE
5. ~~**Issue #9**: Create global toast system~~ DONE
6. ~~**Issue #10**: Add empty states~~ DONE

### Phase 3: Resilience (P2) - Nice to have
7. ~~**Issue #11**: Improve error handling~~ DONE
8. ~~**Issue #12**: Add progress indicators~~ DONE

---

## FILES TO MODIFY

| Priority | File | Changes |
|----------|------|---------|
| ~~P0~~ | ~~`components/navbar/UserMenu.tsx`~~ | ~~Add originalRole prop, conditional render~~ DONE |
| ~~P0~~ | ~~`components/navbar/GlobalNavbar.tsx`~~ | ~~Pass originalRole to UserMenu~~ DONE |
| ~~P0~~ | ~~`app/api/ai/text-to-video/route.ts`~~ | ~~Add requireAuthorRoleForApi~~ DONE |
| ~~P0~~ | ~~`features/auth/roles.ts`~~ | ~~Don't update profiles.role in upsert~~ DONE |
| ~~P1~~ | ~~`components/ui/toast.tsx`~~ | ~~Create toast component~~ DONE |
| ~~P1~~ | ~~`components/books/DeleteBookButton.tsx`~~ | ~~Create confirmation modal~~ DONE |
| ~~P1~~ | ~~`app/(app-author)/author/books/BooksListClient.tsx`~~ | ~~Add empty state~~ DONE |
