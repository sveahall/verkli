# Book order desktop layout — 2026-09-09

The waitlist's book card was capped at 448 px on every screen. At 1024 px and above it now uses a two-column card up to 1120 px wide: a 240 px cover and book information on the left, delivery details on the right. Name and email share a row. Mobile retains the single-column layout and 16 px input text.

Files: `BookOrderSection.tsx` adds presentation wrappers and the delivery heading; `waitlist.css` scopes the desktop grid and styling to the book section; `waitlist-public.spec.ts` adds two desktop regressions. No order-handler, price, checkout API, schema or dependency changes.

Base: `platform` at `e7047c7d`.
Local preview: http://127.0.0.1:3017/waitlist#book-order
Production target: https://www.verkli.com/waitlist#book-order

## QA script
1. Open the preview at 1440 or 1920 px. Confirm the wide card, larger cover and delivery form sit side by side.
2. Check 1024 px: name and email share a row and every field stays inside the card.
3. Check 320 / 390 / 768 px: the card stacks vertically, fields remain readable and the page has no horizontal scroll.
4. Leave the form empty and choose “Fortsätt till betalning”. Confirm the required-address message appears without starting a payment.
5. Tab through the seven inputs and payment button. Confirm visible focus, the 249 kr price and shipping information.

## Verification
- Both new desktop tests first failed because the old card was only 448 px wide.
- Production build / TypeScript and lint passed.
- 167 unit test files / 1,705 tests passed.
- All 12 waitlist browser tests passed, including new desktop geometry and empty-form validation checks, existing signup cases with mocked replies and mobile navigation.
- Visual checks passed at 320 / 390 / 768 / 1024 / 1440 / 1920 px: cover loaded, correct desktop / mobile arrangement, no field or document overflow, working focus, zero console/page errors and zero write requests.
- The local HTTP test browser bypassed CSP's HTTPS-upgrade directive. Live verification uses the normal production CSP.
- Evidence and deployment report: `/tmp/verkli-book-layout-20260909/`.
