# Security Audit — 2026-04-02

## Summary: 0 CRITICAL, 1 HIGH, 8 MEDIUM, 12 LOW

### FIXED in this session

| # | Severity | Fix | File |
|---|----------|-----|------|
| H1 | HIGH | Auth callback uses `NEXT_PUBLIC_SITE_URL` instead of Host header | `auth/callback/route.ts` |
| M1 | MEDIUM | Dropped pod_orders INSERT/UPDATE RLS (payment bypass) | Migration `20260402120000` |
| M2 | MEDIUM | Notifications INSERT restricted to `auth.uid() = user_id` | Migration `20260402120000` |
| M3 | MEDIUM | `users` SELECT restricted to own row (email enumeration) | Migration `20260402120000` |
| M4 | MEDIUM | JSON-LD escaped with `\u003c` (`</script>` injection) | `reader/books/[id]/page.tsx` |
| M5 | MEDIUM | Newsletter sanitizer hardened: multi-pass, attribute allowlist | `lib/newsletters/send.ts` |
| — | — | CSP wildcard `o*` → `*` for Sentry ingest | `next.config.ts` |
| — | — | ReadingProgress: fragile update+insert → upsert | `ReadingProgress.tsx` |

### Remaining (unfixed)

| # | Severity | Issue | File |
|---|----------|-------|------|
| M6 | MEDIUM | CSRF bypassed when Origin header absent | `middleware.ts:26` |
| M7 | MEDIUM | Password change without current password verification | `settings/actions.ts:356` |
| M8 | MEDIUM | `uploadChapterMedia` no file extension validation | `lib/supabase/storage.ts:112` |
| L1 | LOW | `deleteFile()` accepts arbitrary bucket/path | `lib/supabase/storage.ts:137` |
| L2 | LOW | Missing HSTS header | `next.config.ts` |
| L3 | LOW | User-controlled imageUrl to Higgsfield (SSRF via 3rd party) | `ai/text-to-video/route.ts` |
| L4 | LOW | `updateAvatarPath` accepts arbitrary path | `settings/actions.ts:84` |
| L5 | LOW | In-memory rate limiters on waitlist | `waitlist/route.ts:19` |
| L6 | LOW | Dev endpoint gated only by env vars | `dev/social-mock/route.ts` |
| L7 | LOW | Newsletter send missing `requireAuthorRoleForApi()` | `newsletters/[id]/send/route.ts` |
| L8 | LOW | Donation/credit checkout no max amount | `donations/checkout/route.ts` |
| L9 | LOW | `curated_list_items` shows deactivated list items | Migration |
| L10 | LOW | `book_genres` exposes draft book genre mappings | Migration |
| L11 | LOW | `social_connections` UPDATE allows token columns | Migration |
| L12 | LOW | Billing redirect doesn't validate Stripe domain | `BillingPageContent.tsx` |

### Positive observations

- No SQL injection anywhere — all queries via Supabase query builder
- Stripe webhook signature verification correct with idempotency
- Admin client isolated — `assertServerEnv()` + never in client components
- OAuth: HMAC-signed state, PKCE, hardcoded redirect path
- UUID validation consistent with `isValidUuid()` / Zod
- API errors: machine-readable keys, no stacktraces to client
- Profile role always trusted from DB, never user_metadata
