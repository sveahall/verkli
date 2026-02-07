# TOP 20 ISSUES - Verkli-Web Security & UX Audit

## P0 - CRITICAL SECURITY ISSUES

### Issue #1: UserMenu shows "Switch to author" to ALL users (including readers)
- **Risk**: HIGH - UI leak exposes author functionality to readers
- **Impact**: Readers see option they can't use, confusing UX, potential bypass attempts
- **File**: `apps/web/src/components/navbar/UserMenu.tsx:266-284`
- **Fix**: Pass `originalRole` prop from server to UserMenu. Only render "Switch to author" if `originalRole === "author"`.

### Issue #2: `/api/ai/text-to-video` has NO authentication
- **Risk**: CRITICAL - Anyone can use Runway credits to generate videos
- **Impact**: Cost exposure, resource abuse
- **File**: `apps/web/src/app/api/ai/text-to-video/route.ts`
- **Fix**: Add `requireAuthorRoleForApi()` check at the start of POST handler.

### Issue #3: `roles.ts` updateActiveRole updates profiles.role incorrectly
- **Risk**: MEDIUM - Overwrites the original signup role in profiles table
- **Impact**: Source of truth corruption
- **File**: `apps/web/src/features/auth/roles.ts:45-54`
- **Fix**: Only update `preferences.active_role`, never `profiles.role`. The upsert should NOT include `role` field.

### ~~Issue #4: RLS policies don't enforce author role for INSERT on books~~ DONE
- **Risk**: MEDIUM - Readers could theoretically insert books via direct Supabase client
- **Impact**: Data integrity bypass (mitigated by API layer checks)
- **File**: `packages/db/supabase/migrations/00002_rls_policies.sql:13-17`
- **Fix**: Add RLS function to check profiles.role = 'author' for book INSERTs (or rely fully on API layer).
- **Resolution**: `job_status_view` recreated with `security_invoker = on` in migration `20260208010000_ai_jobs_identity_columns.sql`. View now respects RLS on underlying tables. API-layer author checks remain in place.

### Issue #5: Security checks use user_metadata.role instead of profiles.role (DB)
- **Risk**: LOW (current implementation is consistent, but metadata can be stale)
- **Impact**: If user_metadata gets out of sync, security could be compromised
- **Files**: `middleware.ts:132`, `require-author.ts:26`, `(app-author)/layout.tsx:47`
- **Fix**: Consider adding profiles.role check as secondary verification for critical paths.

## P1 - HIGH PRIORITY ISSUES

### Issue #6: GlobalNavbar doesn't pass originalRole to UserMenu
- **Risk**: MEDIUM - Related to Issue #1
- **Impact**: Cannot conditionally render role switch button
- **File**: `apps/web/src/components/navbar/GlobalNavbar.tsx:886,979`
- **Fix**: Fetch originalRole from user.user_metadata and pass it to UserMenu.

### Issue #7: No loading states in BooksListClient for async operations
- **Risk**: LOW - UX issue
- **Impact**: User confusion during operations
- **File**: `apps/web/src/app/(app-author)/author/books/BooksListClient.tsx`
- **Fix**: Add isLoading states and skeleton loaders.

### Issue #8: No confirmation modal for book deletion
- **Risk**: LOW - UX issue
- **Impact**: Accidental data loss
- **File**: `apps/web/src/app/(app-author)/author/books/BooksListClient.tsx`
- **Fix**: Add confirmation modal before DELETE API call.

### Issue #9: Toast system is ad-hoc (inline in UserMenu)
- **Risk**: LOW - UX inconsistency
- **Impact**: Inconsistent feedback across the app
- **Files**: `UserMenu.tsx:29,111-118`
- **Fix**: Create global Toast provider and useToast hook.

### Issue #10: No empty state guidance in author books list
- **Risk**: LOW - UX issue
- **Impact**: New users don't know what to do
- **File**: `apps/web/src/app/(app-author)/author/books/BooksListClient.tsx`
- **Fix**: Add proper empty state with CTA when no books exist.

## P2 - MEDIUM PRIORITY ISSUES

### Issue #11: ErrorBanner only shows for specific error codes
- **Risk**: LOW - UX incompleteness
- **Impact**: Generic errors show nothing
- **File**: `apps/web/src/components/ui/ErrorBanner.tsx:10-31`
- **Fix**: Add fallback message for unknown error codes.

### Issue #12: Book detail page missing progress indicators for long operations
- **Risk**: LOW - UX issue
- **Impact**: User doesn't know if translation/TTS/import is running
- **File**: `apps/web/src/app/(app-author)/author/books/[id]/BookEditor.tsx`
- **Fix**: Add status badges and progress indicators for async jobs.

### Issue #13: Multiple role storage locations cause confusion
- **Risk**: LOW - Architectural debt
- **Impact**: Complex fallback chains, potential inconsistencies
- **Files**: Multiple - `user_metadata.role`, `user_metadata.active_role`, `profiles.role`, `profiles.preferences.active_role`
- **Fix**: Document the canonical source of truth; consider consolidation.

### Issue #14: /api/tts uses token auth, not role auth
- **Risk**: LOW - Intentional design but inconsistent
- **Impact**: Different auth patterns in same codebase
- **File**: `apps/web/src/app/api/tts/route.ts`
- **Fix**: Document this is intentional for internal/service usage.

### Issue #15: Reader home page missing error handling for DB queries
- **Risk**: LOW - Resilience issue
- **Impact**: Page could crash if DB returns error
- **File**: `apps/web/src/app/(app-reader)/reader/home/page.tsx`
- **Fix**: Add try-catch and graceful error states.

## P3 - LOW PRIORITY / POLISH

### Issue #16: No skeleton loaders on initial page loads
- **Risk**: LOW - UX polish
- **Impact**: Flash of empty content
- **Files**: Various page components
- **Fix**: Add Suspense boundaries and loading.tsx files.

### Issue #17: Book status badges not visually consistent
- **Risk**: LOW - Design polish
- **Impact**: Visual inconsistency
- **File**: `apps/web/src/app/(app-author)/author/books/BooksListClient.tsx`
- **Fix**: Standardize badge colors and styles.

### Issue #18: No rate limiting on role switch API
- **Risk**: LOW - Abuse potential
- **Impact**: Could spam role switches
- **File**: `apps/web/src/app/api/auth/active-role/route.ts`
- **Fix**: Add simple rate limiting (low priority).

### Issue #19: LocalStorage verkli_role persists even after signout
- **Risk**: LOW - Minor UX issue
- **Impact**: Old role preference affects new sessions
- **File**: `apps/web/src/components/navbar/GlobalNavbar.tsx:472-479`
- **Fix**: Clear on signout or ignore for authenticated users.

### Issue #20: Search in GlobalNavbar doesn't handle empty results
- **Risk**: LOW - UX polish
- **Impact**: No feedback when search returns nothing
- **File**: `apps/web/src/components/navbar/GlobalNavbar.tsx:605-614`
- **Fix**: Add empty state on destination page.

---

## IMPLEMENTATION PRIORITY ORDER

### Phase 1: Security (P0) - Must fix before any release
1. **Issue #1 + #6**: Fix UserMenu role switch visibility
2. **Issue #2**: Add auth to text-to-video API
3. **Issue #3**: Fix roles.ts to not overwrite profiles.role

### Phase 2: UX Polish (P1) - High impact improvements
4. **Issue #8**: Add book deletion confirmation modal
5. **Issue #9**: Create global toast system
6. **Issue #10**: Add empty states

### Phase 3: Resilience (P2) - Nice to have
7. **Issue #11**: Improve error handling
8. **Issue #12**: Add progress indicators

---

## FILES TO MODIFY

| Priority | File | Changes |
|----------|------|---------|
| P0 | `components/navbar/UserMenu.tsx` | Add originalRole prop, conditional render |
| P0 | `components/navbar/GlobalNavbar.tsx` | Pass originalRole to UserMenu |
| P0 | `app/api/ai/text-to-video/route.ts` | Add requireAuthorRoleForApi |
| P0 | `features/auth/roles.ts` | Don't update profiles.role in upsert |
| P1 | New: `components/ui/Toast.tsx` | Create toast component |
| P1 | New: `components/ui/ConfirmModal.tsx` | Create confirmation modal |
| P1 | `app/(app-author)/author/books/BooksListClient.tsx` | Add empty state, confirm modal |
