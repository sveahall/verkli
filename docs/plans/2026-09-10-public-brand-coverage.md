# Public and authentication brand coverage

Reference: approved `/author` composition in `AuthorLandingPage.tsx` and `AuthorLandingSections.module.css`, and the shared contract in `2026-09-10-unified-brand.md`. This work leaves the approved landing, global tokens, shared navigation/footer, database, dependencies and checkout handlers untouched.

## Design changes

- Public pages share scoped paper/ink surfaces, violet accents, Montserrat Alternates headings at 400–500, responsive editorial columns, hairline chapter rows and 44–48px actions through `components/public/PublicPage.module.css`.
- Auth has a responsive two-column introduction and focused form card. All existing sign-in, signup, email confirmation, application, recovery and reset states use the same shell. On mobile, the form takes priority. Author application screens keep author copy even when their back link returns to reader home.
- Pricing uses native table semantics and native FAQ disclosures; monthly/annual controls expose pressed state. Existing pricing amounts, feature lists, catalog availability and signup destinations are preserved.
- Reader overview, app, how-it-works and membership have route-specific introductions and actions. Existing session/profile checks and reader redirects remain. The overview now links directly to books, genres and authors instead of displaying animated decorative orbs.
- Waitlist retains both role drafts, persisted queue status, duplicate/retry states, product preview selection, book shortcut, book cover, Swedish order form, validation and checkout. It now follows the user's theme, with the same brand logo in both modes. Removed forced dark wrappers and repeated ornamental captions.
- Legal text is unchanged. Privacy and terms add in-page navigation; support and DMCA use legible forms and grouped content. Donation and verified/pending order outcomes follow the same typography and actions.

## Route inventory

Every route below passed final Chrome checks in a fresh signed-out context at 390px and 1440px, in both light and dark modes: 112/112 cases. Each case asserted its final URL, expected heading, actual theme, no page errors and no document overflow. All visible inputs, textareas and selects had associated labels. Redirect routes were checked against their intended destination, including `/product` → `/author` and `/reader/faq` → `/support`.

| Route | Coverage | Check |
| --- | --- | --- |
| `/faq` | Category introductions with keyboard-native disclosures and support links | Mobile Chrome, content/links inspected |
| `/how-it-works` | Numbered manuscript workflow and feature rows | Mobile Chrome |
| `/pricing` | Free/Pro plans, availability-aware periods, comparison table and FAQ | Desktop/mobile, light/dark, pricing unit tests |
| `/product` | Existing redirect to `/author` preserved | Final URL and landing heading verified |
| `/reader` | Reader introduction, discovery paths, benefits and disclosures | Desktop/mobile, light/dark |
| `/reader/app` | App-specific introduction with reader navigation | Mobile Chrome |
| `/reader/how-it-works` | Step-led reader introduction | Mobile Chrome |
| `/reader/membership` | Account-focused introduction and signup/sign-in actions | Mobile Chrome |
| `/reader/faq` | Existing permanent redirect to `/support` preserved | Final URL/heading and redirect unit tests |
| `/support` | Editorial intro, contact form, email routes and native FAQ | Desktop/mobile, light/dark, request unit tests |
| `/privacy` | Reading layout and section navigation; policy unchanged | Desktop Chrome, source audit |
| `/terms` | Reading layout and section navigation; terms unchanged | Mobile Chrome, source audit |
| `/legal/dmca` | Legal introduction, grouped declaration fields, 44px controls | Mobile Chrome, light/dark |
| `/donation/success` | Branded donation acknowledgement and return actions | Mobile Chrome |
| `/donation/cancel` | Branded cancellation and retry/navigation actions | Mobile Chrome |
| `/author/signin` | Auth shell, required fields, Google and recovery controls | Desktop Chrome, light/dark |
| `/author/signup` | Auth shell across initial, loading, confirmation and application states | Initial mobile UI; state branches reviewed |
| `/author/forgot-password` | Shared recovery form and success/error presentation | Mobile Chrome, light/dark |
| `/reader/signin` | Reader auth shell; next-path/session handling unchanged | Mobile Chrome |
| `/reader/signup` | Reader auth shell; confirmation and next-path handling unchanged | Mobile Chrome |
| `/reader/forgot-password` | Reader recovery shell and success/error presentation | Mobile Chrome |
| `/signin` | Existing author sign-in redirect | Final URL and auth heading verified |
| `/signup` | Existing reader signup redirect | Final URL and auth heading verified |
| `/forgot-password` | Existing author recovery redirect | Final URL and recovery heading verified |
| `/auth/reset-password` | Shared shell for session loading, invalid link, form and success | Invalid-link mobile UI; state branches reviewed |
| `/` | Two explicit role choices, book link and preserved role routing | Fresh-context mobile light and desktop dark |
| `/waitlist` | Theme-aware signup, queue states, preview and Swedish book order | Desktop/mobile, light/dark; automated checks below |
| `/order/ta-for-er/success` | Same verified payment-kind guard; branded paid/pending composition | Pending mobile UI; paid branch source audit |

Auth and public-author error boundaries also receive matching surfaces and 44px retry controls. Public layouts continue to use root-owned shared navigation and footer.

## Verification

- Targeted ESLint: passed for every owned route family, auth components and the updated waitlist E2E file.
- Unit tests: 40 passed across pricing availability, reader FAQ redirect, support requests, waitlist mobile invariants and waitlist metadata.
- Final production-preview Chrome route smoke: 112/112 passed across all 28 public/auth routes at 390px/1440px, light/dark, with reduced motion. Fresh contexts prevented remembered role choices from masking selector coverage. The local ignored environment used `BETA_LOCK=false` to test the actual routes; production access policy was not changed. Final report: `/tmp/verkli-public-final-qa.json`.
- Full-page screenshots captured for pricing, FAQ, reader overview/app/membership, author sign-in, reader signup, support, DMCA, selector and waitlist in all four viewport/theme combinations. Pricing, reader app, auth, support, DMCA and waitlist examples were visually inspected. Evidence: `/tmp/verkli-public-final-*.png`.
- Keyboard/control checks: passed in all four viewport/theme combinations. All 13 author FAQ, 6 pricing FAQ and 7 support FAQ disclosures open with Enter and close with Space. Billing buttons retain pressed state, show monthly $29 or annual $19/month billed $228/year, and keep the `/author/signup` destination. Empty author sign-in and DMCA forms enforce required fields; support requires a reply email when signed out. Privacy/terms section links work with the keyboard. Report: `/tmp/verkli-public-final-controls.json`. No application writes were attempted.
- Existing mocked waitlist browser suite: all 12 tests passed in the stable production preview, as confirmed by the root agent. Coverage includes role switching, draft/success/duplicate persistence, retry, 320px/390px input sizing, book reachability, desktop book layout and all product previews. The book-layout selectors use the existing `.wl-order-card` container.
- Final integrated auth recheck: 4/4 passed for author/reader sign-in at 390px and 1440px in dark mode. Recovery-link contrast measures 7.78:1 against the auth card. Footer Help is keyboard-focusable and unobstructed, with 20px clearance from the theme control on mobile and 48px on desktop. Screenshots were visually inspected. Report: `/tmp/verkli-public-final-auth-fix-qa.json`; screenshots: `/tmp/verkli-public-final-auth-fixed-*.png`.
- `git diff --check`: passed for owned tracked files.

No real signup, support message, copyright notice or payment was submitted. Waitlist browser tests mock writes. Paid order confirmation, recovery email completion and protected author-application states were reviewed in source, not forced through live accounts. The root agent confirmed the final integrated build, lint and 1,724 tests passed. Deployment verification remains with the root agent.

## QA script

1. Open `/pricing`, switch billing periods when the catalog offers annual, compare both plans and open FAQ items with Enter/Space.
2. Visit `/reader`, `/reader/app`, `/reader/how-it-works` and `/reader/membership`; follow discovery and signup links.
3. Check author/reader sign-in, signup and recovery at 390px; verify required labels, password controls and `/auth/reset-password` with an invalid link.
4. On `/waitlist`, switch roles, switch all three previews, jump to the book form and submit empty delivery details to see the validation message. Use mocked endpoints for success/duplicate/retry checks.
5. Read `/privacy` and `/terms` using section links, then check support and DMCA fields without submitting live requests.
6. Open both donation outcomes and the order status without a session ID; verify the pending message and return paths.
7. Repeat representative routes in dark mode and at 1440px with reduced motion. Confirm focus visibility, no clipped copy and no horizontal scrolling.
