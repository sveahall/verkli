# Connected author studio — implementation and verification

Goal: make the existing author experience coherent from manuscript to release, retaining every existing production capability and entitlement. User delegated design decisions and authorized live release after verification.

Design: warm paper, ink plum, editorial typography and restrained butterfly colour. Use DESIGN.md tokens and existing controls. Task first, specialist second: a compact consistent assistant entry, one active conversation with correct book/chapter context. Never fabricate agents completing work or operational availability.

## Work packages and file ownership

1. Root: author-shell navigation, BookWorkflowHeader, bookEditor.shared.ts, BookEditorView and shared AI companion. Replace duplicate desktop book tool lists with book context; keep accessible tools in one grouped rail. Group Write/Review, Cover/Translate/Audio, Pricing/Publish. Pricing remains before Publish. Preserve all deep links and demo gates. Retain mobile profile/reader access. Review is editorial review as well as checklist; avoid claims of mandatory completion. Existing optional tools stay reachable through a labelled more-tools menu.
2. Account: components/author/profile and components/author/settings only, associated CSS/tests and dev/account-studio fixture. Clear public profile preview/edit split, no duplicate cover affordances, labelled social fields; settings has concise section index and stable save feedback. Preserve all server actions/field names and billing slot.
3. Overview: features/author-workspaces/home, library and analytics only, associated CSS/tests and dev/studio-overview fixture. Useful home next action and book continuity, calm metrics with honest no-data states and filters; do not alter revenue calculations, endpoints, gates or monetary labels.
4. Book production: editor/panels/{CoverPanel*,PricingPanel*,PublishPanel*,ReviewPanel*}, related scoped CSS/tests and dev/production-studio fixture. Clear cover/front/back/print entry, pricing summary and explicit saves, publication readiness with working remediation links, collapse secondary print/manage sections without dropping content. Preserve callbacks, payments, chapter release, print and delete safeguards. Do not edit audio/translation panels or parent editor.

## Integration constraints

Use isolated worktree from origin/platform 202a48fa. No new dependencies or schema. Do not touch dirty root, other worktrees or freeze-related SQL/AI02. Agents own disjoint files. Root reviews each diff and runs common final checks. Do not commit or push until root integrates.

## Verification

- Existing tests establish baseline; add behavior regressions only for changed navigation, form state, callbacks and errors.
- Fixtures use actual components with clearly synthetic data and mocked external actions; dev routes return 404 in production.
- CUA: 390px/1440px, light/dark, keyboard, expanded sections, assistant open/close, profile save/error, settings password/defaults, analytics filters/no data/error, cover selection, pricing edit, publish remediation.
- Full lint, tsc, Vitest and production build with Proxy middleware. Independent review, per-file diff and 3–7 step QA script.
- Push reviewed branch, merge into platform and verify Railway exact-SHA health/auth/assets. No real publishing, destructive operation or checkout needed for design QA.

## Local completion evidence

All four packages integrated. Full final validation: 266 Vitest files / 2794 tests; ESLint, TypeScript and production build exit 0, including Proxy middleware. Independent reviews and browser QA completed with synthetic fixtures at 390px/1440px, light/dark. Account controlled-select reset and publish-description async-save races were reproduced and fixed. Detailed QA, filewise diff and release evidence: /Users/admin/Documents/Verkli/Connected-studio-2026-09-16. No new dependency, schema or provider calls.
