# Verkli — one identity, every workspace

Updated 2026-09-10. The approved `/author` landing is the visual reference. This guide applies to public pages, authentication, author tools, reader experiences, administration and system states. Brand communicates one company; page composition adapts to the task.

## Colour and surfaces

The butterfly is the original mark in `apps/web/public/favi.svg`. Full wordmarks are `logo-dark.svg` for light backgrounds and `favicon.svg` for dark backgrounds. Do not substitute an icon, distort the paths or recolour the mark.

| Purpose | Light | Dark |
| --- | --- | --- |
| Page | `#fbfaf9` warm paper | `#17131d` ink plum |
| Text | `#19171c` | `#f7f3f8` |
| Elevated surface | `#ffffff` | `#221b2b` |
| Secondary text | `#6c6870` | `#b6aebf` |
| Hairline | `#e7e2e9` | `#3a3043` |
| Primary control | `#24182f` | `#eadff5` |
| Accent text | `#7456bd` | `#c5aff8` |

Violet `#907AFF`, rose `#E29ED5`, apricot `#FCC997` and soft yellow `#FEE9A3` belong to Verkli. They provide highlights, directional light and selected states. Use the accessible accent-text token for small text; the original violet is for marks, focus and larger display accents. Preserve semantic success/warning/error colours and always include text, never colour alone.

`apps/web/src/app/globals.css` owns semantic tokens. Use `bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-accent`, `text-accent-foreground` and `text-primary-foreground` paired with `bg-primary`. Do not apply a second independent slate/navy colour system. Author navigation has a scoped ink-plum treatment; reader navigation uses the same material language with paper surfaces.

## Type and composition

- Existing Montserrat Alternates, weight 400–500, for display/page/section headings. Tailwind `font-display` or shared `text-page-title` / `text-section-title`.
- Inter for controls, body, tables and numbers. Numeric columns use tabular figures. Readable secondary text, not faint decoration.
- Preserve manuscript/editor typography and readers' chosen font, size and reading theme. These are product preferences, not branding errors.
- Marketing: confident type, editorial whitespace, a mix of paper and cinematic ink surfaces, purposeful product interactions. Do not repeat the same mockup down a page or decorate each heading with uppercase status dots.
- Workspace: useful density, aligned page headers/actions, clear rail/canvas/panel hierarchy. Keep important tools visible and stable. Avoid decorative animation on forms and tables.
- Legal and support: readable measure, strong heading hierarchy and plain navigation. Keep legal copy and actual support behavior intact.
- Admin: same tokens, logo, controls and table language. Maintain dense operational readability and real permission checks.

## Shared components

Use `components/ui` for buttons, inputs, cards, tabs, badges, dialogs, page headers and states. Existing `.btn-*`, `.input-base`, `.card-*` and typography utilities resolve to the same system for legacy consumers.

Buttons are tactile pills with 44px targets. Inputs are 44px high, rounded 12–14px, 16px text on mobile to prevent iOS zoom. Cards use 16–24px radii; large feature panels may be broader. Three shadow levels are defined centrally; shadows suggest material depth, not neon halos.

Provide visible labels, associated hints/errors, keyboard focus, loading, success and useful empty states. No hidden premium gate or invented facts. Price availability comes from the existing billing catalog, never visual placeholder values. Navigation, authentication, reader preferences and checkout behavior must survive a visual change.

## Motion and accessibility

The approved landing includes scroll-open chapters, a focus-settling studio, pointer reflection, swipeable samples and the original butterfly's gentle wing motion. These remain the reference for expressive interaction.

For routine controls use 150–200ms colour/press transitions. Use transform/opacity for motion, stop when not visible, and honor `prefers-reduced-motion`. Never take over page scrolling, hide necessary content until animation completes, move a focused control or animate layout while typing. Mobile navigation and floating controls must not overlap.

Both themes are first-class. Verify contrast, keyboard access and 390px/1440px layouts. Essential cookies and analytics consent remain separate choices; design changes must not alter consent behavior.

## Coverage and verification

The complete 103-page inventory and work ownership live in `docs/plans/2026-09-10-unified-brand.md`. Family coverage is recorded in the accompanying public, author and reader/admin reports. Redirects and feature flags are preserved; a protected route still requires its original role. No preview authentication bypasses.

Validate real public pages and authenticated E2E fixture pages, without publishing content or purchasing anything. Run lint, TypeScript, unit tests, the production Turbopack build, and focused browser interaction tests. Root and `main` remain untouched; integration targets current `platform`.
