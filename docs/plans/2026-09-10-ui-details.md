# Verkli interaction details — implementation plan

Goal: carry the already approved Verkli visual language into the small interactive surfaces across the project. This is a polish and defect pass, not a new design direction. Root owns navigation; an independent reviewer audits other shared controls.

Architecture: preserve existing routes, auth and data. Fix common components at source; use native dialog/select behavior where appropriate. Paper/plum surfaces, restrained violet/rose/apricot accents, clear labels, 44px targets, short origin-aware transitions. No dependencies, schemas or new feature gates.

## 1. Navigation
- [x] Reproduce desktop keyboard opening and mobile child-link absence in `e2e/ui-details.spec.ts`; run on the existing production preview before implementation.
- [x] Update `components/navbar/GlobalNavbar.tsx` and dropdown metadata: real disclosure buttons, click/hover/keyboard support, focus return, outside dismissal, viewport-aware panel, submenu links on mobile. Remove the nonfunctional public language icon: public pages do not yet use translated messages, so do not offer a fake locale switch.
- [x] Style the Product panel as a compact editorial introduction, usable destinations and a real studio invitation. Use shared surface classes in `app/globals.css`, no repeated mockup.
- [x] Re-run regression tests on localhost 3020. Capture desktop light/dark and 390px mobile, test Escape, arrows, Tab, outside click, resizing and same-page navigation.

## 2. Project-wide detail inventory
- [x] Trace menu, dialog, select and form primitives plus bespoke variants across public/auth, author, reader and admin route families. Record actual inspected surfaces and any runtime limits.
- [x] Fix concrete findings in shared controls and their consumers, with behavioral regression coverage where needed. Preserve reader typography and secure role checks.
- [x] Review primary/secondary, disabled/loading, empty/error states, focus, overflow and reduced motion. Visual-only changes use visual checks rather than implementation-mirroring tests.

## 3. Verification and release
- [x] Run full lint, TypeScript, unit tests and production build.
- [x] Run focused browser interaction/brand suites on the production build; independently review the diff against current `origin/platform`.
- [x] Document a 3–7 step QA script, exact coverage, screenshots and per-file diff. Keep the preview available.
- [ ] Commit and push the scoped release, merge through the existing checks into platform, verify Railway deployment and the live revision. Main untouched; no production account/content/payment writes during QA.

## Review direction
| Before | After | Why |
| --- | --- | --- |
| Repeated title and large lavender cards in Product menu | Editorial heading, clear destination rows, compact ink studio invitation | Same hierarchy and materials as the approved landing |
| Hover-only link pretending to be a menu trigger | Real disclosure with mouse, touch and keyboard operation | Expected navigation without accidental route change |
| Mobile links omit children | Visible grouped destinations in a focused drawer | No desktop-only navigation |
| Public language icon has no handler | No inactive locale control | Every visible control should have a real action |
