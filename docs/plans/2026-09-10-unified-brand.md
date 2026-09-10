# Unified Verkli brand — 2026-09-10

Approved direction: extend the current /author experience throughout the existing Next app. Preserve all routes, data, permissions, payments, editorial tools and reader preferences. No dependencies or database changes.

## Shared visual contract

- Warm paper #fbfaf9, ink #19171c. White elevated surfaces, hairline #e7e2e9, secondary text #6c6870.
- Brand violet #907AFF, rose #E29ED5, apricot #FCC997. Accessible violet text #7456bd on light surfaces. Dark surfaces #17131d, elevated #221b2b, text #f7f3f8, muted #b6aebf.
- Existing Inter for UI/body; Montserrat Alternates for page/section headings (400–500 weight). Do not change manuscript typeface or reader-selected preferences.
- Root owns semantic CSS variables: background, foreground, card, card-foreground, muted, muted-foreground, primary, primary-foreground, secondary, secondary-foreground, accent, accent-foreground, border, input, ring, sidebar*, brand-violet, brand-rose, brand-amber. Prefer bg-background, text-foreground, bg-card, text-muted-foreground, border-border, bg-accent, text-accent-foreground.
- Root owns globals.css, components/ui, nav, Footer, CookieConsent, GlobalThemeToggle, DESIGN.md. Agents must not edit these shared files.
- Refined 44px controls, clear focus, restrained layered surfaces, generous but useful whitespace. Marketing motion follows the approved landing; task screens use restrained hover/press/expand transitions, respect reduced motion. No fabricated statistics, partners, decorative AI sparkles or giant repeated mockups.

## Implementation and ownership

1. Root: shared tokens, UI primitives, global navigation/footer; route inventory and verification.
2. Public/auth agent: public-author and public-reader marketing, selector, auth, waitlist/order/status/legal/support. Own their feature components and scoped styling, never the approved AuthorLanding* or shared root files.
3. Author agent: app-author route family, author-shell, author-workspaces, author components and functional author feature pages (not AuthorLanding*, AuthorStoryExperience*, AuthorButterfly*, author-experience-data). Preserve backend logic.
4. Reader/admin agent: app-reader, reader-browse, admin, reader feature/components. Preserve reader preferences and roles.
5. Root: independent diff review, lint/typecheck/unit/build, desktop/mobile UI and route audit, localhost preview, release from current platform when all checks pass.

## Route inventory

| Route source | Family |
| --- | --- |
| `(app-author)/account/billing/page.tsx` | `(app-author)` |
| `(app-author)/account/feedback/page.tsx` | `(app-author)` |
| `(app-author)/author/analytics/[metric]/page.tsx` | `(app-author)` |
| `(app-author)/author/analytics/page.tsx` | `(app-author)` |
| `(app-author)/author/audience/page.tsx` | `(app-author)` |
| `(app-author)/author/billing/page.tsx` | `(app-author)` |
| `(app-author)/author/billing/payouts/page.tsx` | `(app-author)` |
| `(app-author)/author/books/[id]/[panel]/page.tsx` | `(app-author)` |
| `(app-author)/author/books/[id]/analytics/page.tsx` | `(app-author)` |
| `(app-author)/author/books/[id]/marketing/page.tsx` | `(app-author)` |
| `(app-author)/author/books/[id]/overview/page.tsx` | `(app-author)` |
| `(app-author)/author/books/[id]/page.tsx` | `(app-author)` |
| `(app-author)/author/books/[id]/settings/page.tsx` | `(app-author)` |
| `(app-author)/author/books/[id]/write/page.tsx` | `(app-author)` |
| `(app-author)/author/books/page.tsx` | `(app-author)` |
| `(app-author)/author/dashboard/page.tsx` | `(app-author)` |
| `(app-author)/author/home/page.tsx` | `(app-author)` |
| `(app-author)/author/inbox/page.tsx` | `(app-author)` |
| `(app-author)/author/library/[id]/page.tsx` | `(app-author)` |
| `(app-author)/author/library/page.tsx` | `(app-author)` |
| `(app-author)/author/marketing/[id]/page.tsx` | `(app-author)` |
| `(app-author)/author/marketing/page.tsx` | `(app-author)` |
| `(app-author)/author/newsletters/[id]/page.tsx` | `(app-author)` |
| `(app-author)/author/newsletters/page.tsx` | `(app-author)` |
| `(app-author)/author/notifications/page.tsx` | `(app-author)` |
| `(app-author)/author/polls/page.tsx` | `(app-author)` |
| `(app-author)/author/production/page.tsx` | `(app-author)` |
| `(app-author)/author/profile/page.tsx` | `(app-author)` |
| `(app-author)/author/publish/[id]/page.tsx` | `(app-author)` |
| `(app-author)/author/publish/page.tsx` | `(app-author)` |
| `(app-author)/author/settings/page.tsx` | `(app-author)` |
| `(app-author)/author/shelves/[id]/page.tsx` | `(app-author)` |
| `(app-author)/author/shelves/page.tsx` | `(app-author)` |
| `(app-author)/author/stats/page.tsx` | `(app-author)` |
| `(app-author)/author/voices/page.tsx` | `(app-author)` |
| `(app-author)/author/write/page.tsx` | `(app-author)` |
| `(app-reader)/reader/billing/page.tsx` | `(app-reader)` |
| `(app-reader)/reader/bookmarks/page.tsx` | `(app-reader)` |
| `(app-reader)/reader/clubs/[id]/page.tsx` | `(app-reader)` |
| `(app-reader)/reader/clubs/page.tsx` | `(app-reader)` |
| `(app-reader)/reader/feed/page.tsx` | `(app-reader)` |
| `(app-reader)/reader/home/page.tsx` | `(app-reader)` |
| `(app-reader)/reader/inbox/page.tsx` | `(app-reader)` |
| `(app-reader)/reader/library/page.tsx` | `(app-reader)` |
| `(app-reader)/reader/notifications/page.tsx` | `(app-reader)` |
| `(app-reader)/reader/orders/page.tsx` | `(app-reader)` |
| `(app-reader)/reader/polls/page.tsx` | `(app-reader)` |
| `(app-reader)/reader/profile/page.tsx` | `(app-reader)` |
| `(app-reader)/reader/settings/page.tsx` | `(app-reader)` |
| `(auth)/author/forgot-password/page.tsx` | `(auth)` |
| `(auth)/author/signin/page.tsx` | `(auth)` |
| `(auth)/author/signup/page.tsx` | `(auth)` |
| `(auth)/forgot-password/page.tsx` | `(auth)` |
| `(auth)/reader/forgot-password/page.tsx` | `(auth)` |
| `(auth)/reader/signin/page.tsx` | `(auth)` |
| `(auth)/reader/signup/page.tsx` | `(auth)` |
| `(auth)/signin/page.tsx` | `(auth)` |
| `(auth)/signup/page.tsx` | `(auth)` |
| `(public-author)/author/page.tsx` | `(public-author)` |
| `(public-author)/faq/page.tsx` | `(public-author)` |
| `(public-author)/how-it-works/page.tsx` | `(public-author)` |
| `(public-author)/pricing/page.tsx` | `(public-author)` |
| `(public-author)/product/page.tsx` | `(public-author)` |
| `(public-reader)/donation/cancel/page.tsx` | `(public-reader)` |
| `(public-reader)/donation/success/page.tsx` | `(public-reader)` |
| `(public-reader)/legal/dmca/page.tsx` | `(public-reader)` |
| `(public-reader)/privacy/page.tsx` | `(public-reader)` |
| `(public-reader)/reader/app/page.tsx` | `(public-reader)` |
| `(public-reader)/reader/faq/page.tsx` | `(public-reader)` |
| `(public-reader)/reader/how-it-works/page.tsx` | `(public-reader)` |
| `(public-reader)/reader/membership/page.tsx` | `(public-reader)` |
| `(public-reader)/reader/page.tsx` | `(public-reader)` |
| `(public-reader)/support/page.tsx` | `(public-reader)` |
| `(public-reader)/terms/page.tsx` | `(public-reader)` |
| `(reader-browse)/reader/authors/[id]/page.tsx` | `(reader-browse)` |
| `(reader-browse)/reader/authors/page.tsx` | `(reader-browse)` |
| `(reader-browse)/reader/books/[id]/page.tsx` | `(reader-browse)` |
| `(reader-browse)/reader/books/[id]/pod/cancel/page.tsx` | `(reader-browse)` |
| `(reader-browse)/reader/books/[id]/pod/success/page.tsx` | `(reader-browse)` |
| `(reader-browse)/reader/books/[id]/purchase/cancel/page.tsx` | `(reader-browse)` |
| `(reader-browse)/reader/books/[id]/purchase/success/page.tsx` | `(reader-browse)` |
| `(reader-browse)/reader/discover/page.tsx` | `(reader-browse)` |
| `(reader-browse)/reader/genres/page.tsx` | `(reader-browse)` |
| `(reader-browse)/reader/lists/[slug]/page.tsx` | `(reader-browse)` |
| `(reader-browse)/reader/onboarding/page.tsx` | `(reader-browse)` |
| `(reader-browse)/reader/read/[chapterId]/page.tsx` | `(reader-browse)` |
| `(reader-browse)/reader/writers/[id]/page.tsx` | `(reader-browse)` |
| `(selector)/page.tsx` | `(selector)` |
| `admin/author-applications/page.tsx` | `admin` |
| `admin/beta/page.tsx` | `admin` |
| `admin/books/[id]/page.tsx` | `admin` |
| `admin/books/page.tsx` | `admin` |
| `admin/feedback/page.tsx` | `admin` |
| `admin/page.tsx` | `admin` |
| `admin/queues/page.tsx` | `admin` |
| `admin/users/[id]/page.tsx` | `admin` |
| `admin/users/page.tsx` | `admin` |
| `auth/reset-password/page.tsx` | `auth` |
| `dashboard/page.tsx` | `dashboard` |
| `dev/waitlist-email/author/page.tsx` | `dev` |
| `login/page.tsx` | `login` |
| `order/ta-for-er/success/page.tsx` | `order` |
| `settings/page.tsx` | `settings` |
| `waitlist/page.tsx` | `waitlist` |

Total page entries: 104 after including platform’s panel-path redirect. Redirect-only and protected server pages retain their access behavior; design coverage is traced through layouts and shared components, with representative browser checks and explicit limits recorded in QA.

## QA script

1. Open /author and scroll through all four feature chapters; test buttons and butterfly.
2. Visit public author/reader product, pricing and FAQ pages in light and dark mode; follow main CTAs.
3. Open author/reader signin, signup and password recovery; check labels, errors and keyboard focus.
4. Check author library/editor/settings and reader discover/library/book view under the authenticated test setup.
5. Verify admin tables plus legal, waitlist and order pages retain usable navigation and forms.
6. Repeat representative screens at 390px and 1440px; inspect overflow, focus, reduced motion, console errors.
7. Run lint, typecheck, unit tests and production build, then verify the deployed revision in the browser.
