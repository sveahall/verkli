# Shared control audit — 2026-09-10

Reference: `DESIGN.md`, approved author landing, and the user’s open Product dropdown screenshot. Source inspection traced shared controls through public navigation, author workspaces, reader pages and administration. This is a control-family audit, not a claim that every authenticated route and data state was exercised in a browser.

## Confirmed issues and fixes

| Surface | Evidence before | Change |
| --- | --- | --- |
| Shared native Dialog | Initial-open mount missed its cancel listener; no title association or forwarded accessible label; clicking empty panel padding dismissed | React native cancel handling, title association, forwarded id/ARIA, genuine backdrop-only dismissal, viewport-bound scrolling |
| Shared account dropdown | Keyboard opening stayed on the trigger; no Escape/focus dismissal; fixed left position and unbounded height | Focus entry, arrow/Home/End navigation, logical Tab exit, Escape return, outside pointer/focus dismissal, viewport clamping, scroll/resize dismissal and shared popover surface |
| Editor/author command palette | Hover Create book then Enter executed Open analytics because event handlers shared the final mutable row index | Capture each row’s index in its own render scope |
| Author settings | Email/password/publishing labels were detached from their inputs; email notification checkbox had no name | Five explicit label/id pairs and accessible checkbox text; submission semantics unchanged |

The root implementation covers the related public Product dropdown/mobile navigation and notification loading/dismissal issues. Another bounded implementation covers new-book/translation controls. Import and campaign dialog findings were handed to the root implementation.

## Other inspected consumers

- Shared `Input`: existing visible labels, errors/hints, password visibility control and 16px mobile type already follow the design guide.
- Reader discover `LanguageSelect`: existing accessible name, 44px minimum height, 16px mobile type and native selection semantics; preserve native interaction.
- Admin book/feedback status filters: label/id associations and theme tokens already present; smaller mobile type is handled centrally by the root control styling.
- `CreateClubDialog`, `DeleteBookButton`, poll creation, chapter deletion and admin book confirmation consume shared Dialog, so receive its naming/dismissal/viewport fixes.
- Author `CreateBookDialog` and `ImportBookModal` used separate div overlays with missing native focus containment; handed to their implementation owners.
- Author dashboard `StatsCard` tooltip was hover-only, lacked an accessible description and did not clear its timer on unmount. It now exposes the explanation on keyboard focus, associates its description, dismisses on Escape/blur and clears timers. Mouse hover is preserved.
- Reader-selected manuscript typography and reading themes remain product preferences, not branding defects.

## Verification evidence

- Original local production build (`3019`): two account regression checks failed after successfully opening the visible mobile reader account control; the named usable account region was absent.
- Current development build (`3020`): those two account checks passed, including Escape return and a 320px viewport/resize check.
- Standalone browser harness using the real shared Dialog: title name, forwarded id, initial-open cancellation and interior-padding checks failed before and passed after. Native Escape return remained passing. Five checks passed.
- Original production palette: hovering Create book then Enter navigated to analytics, reproducing the defect. The fixed real component passed the same hover/Enter choice in an isolated browser harness.
- Permanent regression: `apps/web/e2e/command-palette.authed.spec.ts`. It only opens the existing new-book form and never creates content. Full development navigation was affected by cold compilation; the final production-build suite is authoritative for integrated results.
- Metric-tooltip browser harness: focus and description checks failed before and passed after; Escape preserves link focus, and Tab continues into the next control. Four checks passed.
- Targeted ESLint passed for modified components and the permanent palette test.
- Local harnesses and evidence live under `/tmp/verkli-ui-details/dialog/` and `/tmp/verkli-details/`. No production content, role, notification or payment mutations were submitted by this subtask.

## Final shared-surface pass

- Product disclosure: restrained paper/plum surface, studio destination, pointer/keyboard/touch operation, logical focus return and mobile child links in a native drawer. Removed the public language icon that did not perform an action.
- Notifications: loading, empty and recoverable failed-load states; retry, failed-update feedback, correct reader/author archive link, toggle/outside/Escape dismissal and contained mobile surface.
- Create book/import/campaign: shared native dialog, associated titles/fields, keyboard containment and return, genuine backdrop dismissal and short-viewport scrolling. Import file input is keyboard reachable after the existing rights controls are completed. Switching from new book to import does not close the flow.
- Native selectors retain system pickers and keyboard semantics, with consistent focus, 44px height, readable mobile type and one chevron. Existing sibling chevrons suppress the shared background icon.
- Translation target uses a labelled native select. Reader preferences close on Escape and restore their trigger without changing reader-selected typography.
- Campaign steps were visually inspected and checked for interior horizontal overflow. Long book titles, narrow channel grids and the date row stay inside the dialog. Selection buttons expose their pressed state.

## Scope and verification limits

Source inspection covered the common menu/dialog/input/select controls and bespoke variants in the public/auth, author, reader and admin families. Browser checks covered public pages plus representative real author/reader flows using the existing E2E account. This does not certify every admin permission combination, every record or every possible account state. Production account/content/payment/AI-provider operations were not used as visual QA. One early reader test may have advanced the isolated test account's reading position; subsequent tests intercept both API and direct reading-progress REST writes.

Local translation/marketing flags were enabled only while building the QA preview, so their existing controls could be checked. All translation-preview requests were intercepted because that GET invokes a provider. Production flags remain unchanged.

## Reproduce browser verification

With the existing fixture credentials in the ignored app environment, start a production preview and run from `apps/web`:

```sh
UI_DETAILS_PREVIEW_URL=http://127.0.0.1:3021 PLAYWRIGHT_CHANNEL=chrome npx playwright test --config playwright.details.config.ts
```

Without fixture credentials, the config runs the public checks only. Enable `NEXT_PUBLIC_TRANSLATIONS_ENABLED=true` and `NEXT_PUBLIC_MARKETING_ENABLED=true` in the local build/start command to include those controls. The config does not enable them itself or change deployment settings.

## Manual QA (6 steps)

1. Open `/author`, then Product. Move from the trigger into the panel, follow a destination, reopen with the keyboard and verify arrows/Tab/Escape. Repeat in dark mode.
2. At 390px, open the navigation drawer. Verify How it works, Pricing, close, Escape and focus return; no horizontal scroll.
3. With the fixture account, open Account and Notifications on `/reader/discover`. Check all links are reachable by keyboard, outside-click dismissal and the empty/error/retry states using request interception.
4. Open New book from `/author/library`. Check labels, language picker, Enter submission with a mocked failure, then switch to import. Complete the local rights fields and focus the file chooser without uploading.
5. Open `/author/marketing` in the local enabled preview. Advance through all five steps without creating a campaign, check mobile containment, close/reopen, then verify the reader preferences panel closes with Escape.
6. Recheck waitlist role selection, studio tabs, swipe/scroll interactions, audio on explicit play, reduced motion and the wide book-order form. Do not place an order or submit a real signup during QA.

## Pre-release result

Full lint, TypeScript and production webpack build passed. All 1,724 unit tests in 169 files passed with two workers; an earlier unbounded parallel run hit a worker/test timeout under load. The final production browser run passed all 57 checks, including fixture login, all five campaign steps, import handoff and translation preview. Desktop/mobile light/dark screenshots and campaign close/reopen checks passed. Independent code review found no blocking regressions. Release synchronization/deployment follows this snapshot.
