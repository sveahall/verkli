# Unified Verkli design — release QA

This release extends the approved author landing's paper/ink surfaces, butterfly colours, display typography, controls and navigation to the public, auth, author, reader and admin page families. The approved landing's scroll chapters, swipe controls, audio and butterfly interactions remain intact.

## Coverage and evidence

- [Route inventory and visual contract](2026-09-10-unified-brand.md).
- [Public and auth route checks](2026-09-10-public-brand-coverage.md): 28 routes, each at 390px and 1440px in light and dark mode. All 112 checks reached the expected URL and heading, without document overflow, browser page errors or unlabelled visible fields.
- [Author workspace checks](2026-09-10-author-brand-coverage.md): legitimate fixture sign-in; dashboard, library, billing, editor and panels; desktop/mobile and both themes. No manuscript was saved or generated.
- [Reader and admin checks](2026-09-10-reader-admin-brand-coverage.md): legitimate reader navigation, private pages, dark/mobile layout, browse pages and access boundaries. The author fixture was correctly denied admin access. Admin interiors and populated reader chapters were reviewed in source; they were not bypassed or fabricated for screenshots.

## Automated verification

- Final integration against platform `29e5e5d8`: full lint, TypeScript and production build passed.
- Final integrated unit suite: 169 files, 1,724 tests passed. The next-path and selector regression suite also passed all 57 tests.
- Author experience browser suite: 14 passed, including scroll chapters, swipes, narration, keyboard, reduced motion and butterfly interaction.
- Waitlist browser suite: 12 passed, including role drafts, duplicate/retry states, mobile inputs, desktop book-order columns and product preview tabs. Network writes were mocked.
- Shared brand browser suite: 4 passed, covering theme readability, mobile navigation, keyboard password visibility, signup destination preservation and labelled mobile forms.

All 30 browser tests passed together against the final production build. The final mobile editor/translation, auth footer/contrast and reader empty-state/settings fixes were separately rechecked in Chrome after integration.

## Bugs corrected during review

- Reader sign-in's server-rendered signup link lost its `next` destination during hydration. An isolated Suspense boundary now resolves the validated query value without suspending the form.
- Theme control was hidden from assistive technology and overlapped mobile navigation. It now has normal accessibility exposure and respects the app navigation area.
- Password visibility is now keyboard reachable with a 44px target.
- Dark-mode hover, selected icon, chart key and switch-thumb contrast were corrected.
- The author sidebar uses the original coloured butterfly and white wordmark instead of a monochrome image filter.
- The mobile editor title, reader settings spacing, auth footer and empty reader spotlight receive targeted layout fixes. Disabled translation shows a clear state and a return action.

## Release boundaries

No dependencies, schema, pricing, payment flow, authentication rules, admin roles, manuscript storage or reader-selected typography were changed by this release. The local QA environment temporarily disables the rollout gate to inspect legitimately authenticated workspaces; production rollout and discovery flags are preserved. No real signup, support message, order, email or AI generation was submitted by the browser checks. Admin account actions, populated reader chapter rendering and paid checkout were not exercised against live data.

## UI QA script

1. Open `/author`, scroll through all four chapters, switch studio tools, swipe on mobile and activate the butterfly with keyboard or pointer.
2. Visit `/pricing`, `/reader` and `/support`; switch theme and open FAQ disclosures with Enter/Space.
3. Open `/reader/signin?next=%2Freader%2Flibrary`; Tab to the password visibility button, then follow “Create one” and confirm the destination is retained.
4. Sign in as an invited author; inspect dashboard, library, billing and an existing manuscript. Open editor panels without saving or purchasing.
5. Use the app's reader switch; inspect home, library, profile, settings and notifications. Confirm empty collections have useful actions.
6. At 390px, check navigation, editor title, help links and theme control; at 1440px, verify the wide book-order layout on `/waitlist`. Submit no live checkout.
7. Confirm the deployed revision, repeat public navigation and theme checks on `www.verkli.com`, and keep protected routes subject to their existing access rules.
