# Beta access fixes implementation plan

> Execute in isolated worktrees using subagent-driven-development, with failing regression tests before code and independent specification and quality reviews before integration.

Goal: fulfil the existing invitation's free author Pro access during the beta and keep audiobook previews bound to the selected edition. These are bounded repairs to the authorized beta-readiness work, not subscription purchases or new product tiers.

## Author beta entitlement

Architecture: derive a temporary server-side entitlement from the existing protected author role and beta flag. Keep Stripe records unchanged. Use one explicit server switch, `BETA_AUTHOR_PRO_ENABLED=true`, default closed; ending the beta offer is an explicit release action, independent of BETA_LOCK.

Files: `apps/web/src/lib/billing/{server,state}.ts`, `apps/web/src/app/api/billing/state/route.ts`, `apps/web/src/hooks/useBillingState.ts`, `apps/web/src/components/billing/BillingPageContent.tsx`, and focused adjacent tests. Add a small entitlement helper only if needed for clarity; no dependency/schema changes.

- [x] Reproduce an invited author with no paid row being denied Pro; test ordinary authors/readers, removed flags, switch off, read errors and unchanged active paid state.
- [x] Require both authoritative `profiles.role` author/admin and `user_flags.beta_enabled=true` for the author billing view. Treat failed reads as errors, never grants. No client metadata/cookie may confer entitlement.
- [x] Return an explicit beta entitlement marker in server and API state. Expose effective Pro access to all existing gates. Retain subscription identifiers, real billing status and cancellation dates; do not write fake Stripe subscriptions.
- [x] Render “Verkli Pro · Beta” and “Included until public launch. No card required.” for beta-only access. Suppress redundant purchase/manage actions when there is no actual subscription, preserve actual paid-account management. Revocation takes effect on the next server request and normal UI refresh.
- [x] Run regression tests red then green, focused billing/auth suites, lint/typecheck/build. Review exact changed files independently. Leave activation to root after integration.

## Selected audiobook edition

Architecture: pass the selected edition ID from the existing studio to the preview route. Verify book ownership and edition membership before provider invocation; use that edition's language and first nondeleted text. Keep existing pronunciation-preview semantics and voice resolver.

Files: `apps/web/src/app/(app-author)/author/books/[id]/editor/panels/AudiobookPanel.tsx`, its tests, and `apps/web/src/app/api/books/[id]/audiobook/preview/route.{ts,test.ts}`; shared TTS validation only where existing providers require it.

- [x] Reproduce two editions with different languages where selecting the older edition previews the latest one.
- [x] Include the selected `versionId` in the standard preview request and validate UUID/book membership/language before spending. Reject foreign/deleted/empty requested editions with useful errors; never fall back to a different edition. Keep existing unscoped callers backward compatible only when no edition was requested.
- [x] Cancel/ignore stale preview responses when book or edition changes, clear the old audio URL and revoke object URLs. Preserve current narration voice and pronunciation previews.
- [x] Verify the provider receives the intended text/language, rejects foreign editions before invocation, and late responses cannot replace the selected edition's audio. Run focused tests plus lint/typecheck/build, then independent reviews.

## Release proof

Integrate only reviewed commits, run aggregate checks, publish the exact candidate and verify deployed SHA. Enable beta Pro only with its protected inputs verified; enable reviewed translation only after S1/RPC and worker/queue cutover. Use private synthetic books for paid QA within the previously approved allowance, preserve receipts and never reset usage counters. No real purchase, external messages, royalty transfer or campaign publication is part of these fixes.
