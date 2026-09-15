# Author library mockup implementation plan

**Goal:** Build the supplied library dashboard composition using existing data and preserve creation/import, deletion, editor routing, notifications, auth and branding.

**Architecture:** Library-local presentation and CSS inside the existing author shell. A small pure model owns current routing semantics and client-side search/filter/sort. No data/schema/dependency changes. Existing command palette and notifications remain available.

**Tech stack:** Next.js 16, React 19, TypeScript, existing Lucide/icons, CSS modules, Vitest and Playwright.

The supplied mockup is the user-approved visual direction. Keep existing DESIGN.md type/semantic tokens and responsive author navigation. Use real counts instead of mockup-only words, review states, goals or invented activities. The coordinator confirmed base b259dc5fe34f3883da4217e0f2982cfa3b6afb03 and library-only ownership; logo/shell edits belong to the coordinator.

## Work and acceptance

- [x] Extract `library-model.ts` with existing six-step routing, status labels, deterministic non-mutating filtering/sorting and meaningful unit regressions. Preserve demo cover route and source-recent current book independently of filters.
- [x] Update `LibraryWorkspace.tsx` and add `LibraryWorkspace.module.css`: prominent resume hero, four real metrics, title/description search, All/Drafts/Published/Archived filters, recent/title/chapter sort, grid/list view, richer cards, separate accessible delete action, honest recent-updates/progress/inspiration column. Preserve exact accessible New book button, CreateBookDialog initial open, reader links and command palette event. Include library-empty and search-empty states, missing covers/descriptions/dates, long titles, both themes and reduced motion.
- [x] Update library `loading.tsx` for matching skeleton geometry. Do not change server data contracts or global/shared layout.
- [x] Add development-only `dev/author-library` fixture with real library and author shell, synthetic sample/empty/stress data and blocked/mock writes installed before mount. Test production guard. Add focused browser script with localhost guard and external request denial.
- [x] Run baseline then final lint/TypeScript/unit/Turbopack build; browser checks at 320/390/768/1440 with search/sort/status/list, real dialog open/cancel/error, links and focus targets, dark/reduced motion. Perform independent spec then quality review. Deliver scoped commit, per-file diffs, test logs and local preview; no deploy.

## Five-step QA

1. Open preview, compare full library composition, resize mobile/desktop; verify missing-cover state and no horizontal page overflow.
2. Search a title/description, filter Archived/Published, sort by title/chapters, switch list/grid, clear no-results state; source books and resume card remain stable.
3. Open New book from header and card; type, cancel, reopen, use import link, verify error feedback with mock requests and preserved focus.
4. Open a book action and cancel delete; confirm no navigation or delete occurs. Inspect normal/demo editor URLs and published reader link.
5. Check empty/stress samples, both themes, reduced motion, keyboard focus and 44px controls.

## Verification outcome

Lint, TypeScript and ordinary Turbopack production build pass. Unit: 183 files / 2,105 tests pass. Browser: 7 main groups plus focused clear-filter focus and image404 regressions pass (8 unique groups). Independent spec and quality reviews accepted. Real authenticated storage/provider flows are unchanged and were not exercised; fixture is development-only with mocked writes. Integration and deployment remain with the coordinator.
