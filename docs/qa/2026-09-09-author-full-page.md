# Author landing: complete product story

## Scope and design

Continue the approved studio hero across `/author`: a compact product navigation,
an editorial introduction, a dark writing-studio feature, paired translation and
audiobook features, a three-step publishing story, accessible FAQ and one early
access CTA. Keep Verkli’s Montserrat Alternates and violet–rose–apricot identity.
Reuse the three approved studio illustrations. Retain the current hero and auth
behavior. Remove the partner ticker, unsubstantiated distribution claims, duplicate
CTA and oversized lazy placeholders as part of replacing the old lower sections.
Give the fixed navigation a stable surface on this landing page so its glass
refraction does not distort the artwork during scrolling.

## Design review

| Before | After | Why |
| --- | --- | --- |
| Repeated pastel text cards and oversized gaps | Writing studio, paired image sections and numbered publishing steps | Show the product and establish a clear reading order |
| Two identical closing CTAs | One invitation with a working waitlist link | Give the page one clear destination |
| Refracted content behind the navigation | Opaque surface scoped to this landing page | Keep navigation readable while scrolling |
| Decorative logo extends outside its mobile panel | Logo stays inside the panel | Prevent internal horizontal scrolling when an element receives focus or is scrolled into view |

## Implementation and verification

- [x] Replace the old lower sections in `AuthorLandingPage.tsx` with
  `AuthorLandingSections.tsx`; keep all auth code and the approved hero.
- [x] Add scoped `AuthorLandingSections.module.css`: editorial light/dark rhythm,
  full-width desktop composition, stacked mobile sections, keyboard focus and
  reduced-motion support. No dependency or schema changes.
- [x] Verify image loading, section anchors, FAQ keyboard interaction, CTA routes,
  no horizontal overflow at 320/390/768/1024/1440/1920, light and dark modes.
- [x] Run lint, TypeScript, production build and the existing unit suite.
Release procedure: publish the reviewed diff from current `platform` and repeat
read-only checks at `https://www.verkli.com/author`. Keep release evidence in
`/tmp/verkli-author-rest-20260909/deployment-report.md`.

## UI QA — five steps

1. Open `http://127.0.0.1:3017/author` signed out. Check the approved hero and scroll
   through writing, translation and audio; all images should load without blank gaps.
2. Use the four product links below the hero. Each should reach its matching section
   with the title visible below the fixed navigation.
3. Tab to the FAQ and use Enter/Space to open and close an answer.
4. Check 390px mobile and 1440px desktop, then dark mode. Check image proportions,
   readable text, visible focus and the absence of horizontal scrolling.
5. Follow “Join the waitlist” to `/waitlist` and “Explore the workflow” to
   `/how-it-works`. Do not submit a signup, order or start a paid AI job.

## Results

- Lint, standalone TypeScript and the production Turbopack build passed.
- Full unit suite on the updated platform base: 168 files, 1,710 tests passed.
- Browser QA passed at 320, 390, 768, 1024, 1440 and 1920px in light mode,
  plus 390 and 1440px in dark mode. All four section links position their target
  below the navigation. FAQ opens/closes with Enter/Space. The waitlist and
  workflow links reach their expected routes.
- All illustrations load. No horizontal page or invitation-panel overflow;
  navigation has no refractive backdrop filter. No page/console errors or writes.
- Images visually reviewed on desktop and mobile. Screenshot evidence and the
  read-only browser runner: `/tmp/verkli-author-rest-20260909/`.
- Change base: `324185a9` on `platform`; the two upstream fixes are retained.
