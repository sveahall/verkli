# Design System — Verkli

> The platform for authors and readers. This document captures the actual design system as implemented in `apps/web/src/app/globals.css`. It is the source of truth for all visual decisions. Read this before making any UI change.

## Product Context

- **What this is:** A publishing and reading platform. Authors import books, generate AI audiobooks (Qwen TTS), translations (Opus MT, sv↔en), marketing campaigns, and social posts. Readers discover, read, and listen.
- **Who it's for:** Indie authors and the readers who follow them. Two sides, one product.
- **Space:** Indie publishing, audiobook tooling, creator economy.
- **Project type:** Hybrid. Marketing site (`/`, `/pricing`, `/how-it-works`) is brand-forward. Author dashboard and reader app are dense, task-focused.
- **Memorable thing:** Warm, optimistic publishing tools. The sunset palette (violet → rose → amber) is the brand. Glass-rich in dark mode, soft and printed-paper-like in light mode. Author-side reads as serious craft software; reader-side reads as inviting library.
- **Locale:** English-first for reader and public pages (enforced by `check:english-default` CI). Swedish only inside the author dashboard.

## Aesthetic Direction

- **Direction:** Soft optimism. Editorial-meets-utility. Light mode reads like a finely typeset book; dark mode adds layered glass and gradient atmospherics.
- **Decoration level:** Intentional. Decorative blobs and animated orbs appear in marketing and reader hero sections. Author dashboard stays clean (cards, tables, minimal ornament).
- **Mood:** Warm, craft-respecting, grown-up. Not toy, not corporate. The kind of tool a serious author would pick over a Word document because it makes the work feel like the work it is.
- **Reference posture:** Closer to Notion (clean editorial surfaces) and Goodreads (warm, library-like discovery) than to Substack or Medium. Visual identity comes from the violet→rose→amber gradient and the brand wordmark.

## Typography

Two typefaces, loaded via `next/font/google`. Variables wired into `globals.css` `@theme inline`.

- **Display / Branding:** `Montserrat Alternates` — `--font-montserrat-alternates`, weights 400/500/600/700. Used for the wordmark, marketing headlines, and brand-forward moments. Provides a rounder, friendlier counterpoint to Inter.
- **UI / Body / Data:** `Inter` — `--font-inter`. Drives all dashboard, reader, and form UI. Tabular-nums (`font-variant-numeric: tabular-nums`) required for numeric columns and stat displays.
- **Mono:** `ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace` — for inline code and sample IDs only. We do not currently load a custom mono.

> **Known convergence risk.** Inter is the universal SaaS default. We accept this for the MVP because the brand differentiation comes from color and gradient, not type. Re-evaluate post-launch if the product feels generic in user testing.

### Type scale (utility classes, see `globals.css` `@layer utilities`)

| Class | Size | Use |
|---|---|---|
| `.text-page-title` | 28/32px, 600, tracking-tight | Page H1 |
| `.text-section-title` | 20/22px, 600 | Section H2 |
| `.text-stat` | 32px, 600, tracking-tight | Big numbers |
| `.text-stat-sm` | 24px, 600 | Smaller stats |
| `.text-eyebrow` | 12px, 600, uppercase, 0.2em tracking, slate-500 | Section eyebrows |
| `.text-body` | 15px, 1.625 line-height, slate-600 | Body paragraphs |
| `.text-label` | 13px, 500 | Form labels |
| `.text-helper` | 13px, slate-500 | Helper text under inputs |
| `.text-caption` | 11px, 500, slate-400 | Captions / fine print |

Body min-size 15px. Mobile body min-size 16px (Tailwind default — no special override). Headings use `tracking-tight`; body uses default. Always prefer the utility classes over ad-hoc sizes.

## Color

OKLCH color space. CSS variables driven by `:root` (light) and `.dark` (dark). Tailwind v4 reads them via `@theme inline`.

### Brand (literal hex, set on `:root`, available in light and dark)

| Variable | Hex | Role |
|---|---|---|
| `--brand-violet` | `#907AFF` | Primary brand accent |
| `--brand-violet-hover` | `#8069EE` | Hover |
| `--brand-violet-active` | `#7058DD` | Active/pressed |
| `--brand-rose` | `#E29ED5` | Gradient mid-stop, secondary accent |
| `--brand-rose-soft` | `#c4a0e8` | Soft mid |
| `--brand-amber` | `#FCC997` | Gradient end-stop, warm highlight |
| `--brand-amber-soft` | `#FEE9A3` | Pale highlight |

The brand gradient is `linear-gradient(to right, --brand-violet, --brand-rose, --brand-amber)`. Use via `.text-brand-gradient` for headline accents. Do not invent new brand colors. If you need a new accent, derive from these.

### Surfaces (OKLCH)

| Token | Light | Dark |
|---|---|---|
| `--background` | `oklch(1 0 0)` | `oklch(0.145 0 0)` |
| `--foreground` | `oklch(0.145 0 0)` | `oklch(0.985 0 0)` |
| `--card` | `oklch(1 0 0)` | `oklch(0.205 0 0)` |
| `--muted` | `oklch(0.97 0 0)` | `oklch(0.269 0 0)` |
| `--muted-foreground` | `oklch(0.556 0 0)` | `oklch(0.708 0 0)` |
| `--border` | `oklch(0.922 0 0)` | `oklch(1 0 0 / 10%)` |
| `--ring` | `oklch(0.708 0 0)` | `oklch(0.556 0 0)` |

### Semantic status (always use these for success/warning/error/info)

| Token | Light | Dark |
|---|---|---|
| `--color-success` | `oklch(0.62 0.17 145)` | `oklch(0.72 0.17 150)` |
| `--color-warning` | `oklch(0.75 0.18 75)` | `oklch(0.80 0.16 80)` |
| `--color-info` | `oklch(0.62 0.15 250)` | `oklch(0.72 0.14 250)` |
| `--color-error` | `oklch(0.58 0.22 27)` | `oklch(0.72 0.19 25)` |

Each pairs with a `-muted` variant for backgrounds. Never encode state by color alone — always pair with an icon or label.

### Marketing / workspace

`--workspace-accent` = `--brand-violet`. `--workspace-draft-accent` = `#f59e0b` (amber). `--workspace-final-accent` = `#10b981` (green). Use `.card-draft` (4px left amber border) and `.card-final` (4px left green border) for marketing campaign states only. Do not use the colored-left-border pattern outside the workspace context.

### Auth background

`--auth-background` is a soft radial gradient: `#F4F2FF → #F7F6FF → #FFFFFF` in light, `#3A3A4F → #171620 → #000000` in dark. Used for signed-out shells. Auth cards use `.card-auth` (solid white in light, frosted glass in dark).

### Dark mode rules

- Surfaces use OKLCH lightness elevation, not pure inversion.
- Text in dark uses off-white (`oklch(0.985 0 0)`), never `#FFFFFF`.
- Glass effects (`backdrop-filter: blur(...)`) are allowed only in dark mode for cards and buttons. Light mode buttons are solid (see `.glass-button` light override in `globals.css:389`).
- Brand accents stay the same hex in both modes (intentional — the violet/rose/amber holds in both).

## Spacing

- **Base unit:** 4px (Tailwind default scale: 1 = 4px, 2 = 8px, 4 = 16px, 8 = 32px).
- **Density:** Comfortable. Author dashboard runs slightly tighter than reader/marketing.
- **Page wrappers (utility classes):**
  - `.page-content` — `max-w-6xl`, `px-4 sm:px-6 lg:px-10` (default for app pages)
  - `.page-content-narrow` — `max-w-3xl`, `px-4 sm:px-6` (forms, settings)
  - `.workspace-page` — `max-w-[1520px]`, `px-4 sm:px-6 lg:px-8 xl:px-10` (creative workspace)
- **Section rhythm:**
  - `.section-gap` — `space-y-8 sm:space-y-10`
  - `.section-gap-lg` — `space-y-12 sm:space-y-16`
  - `.section-stack` — `gap: clamp(64px, 8vw, 120px)` (marketing landing only)
- **Safe area:** body uses `env(safe-area-inset-*)` padding. Use `.safe-area-inset-bottom` / `-top` utilities for sticky bars.

## Layout

- **Approach:** Hybrid. Marketing sections are creative-editorial. App and reader use disciplined grids.
- **Workspace grid:** `minmax(240px, 280px) | minmax(0, 1fr) | minmax(360px, 400px)` at `lg+`. Use `.workspace-grid` (3 columns) or `.workspace-grid-canvas-only` (2 columns).
- **Border radius scale** (`@theme inline`):
  - `--radius` base: 0.625rem (10px)
  - `--radius-sm`: calc base − 4px (6px) — small inputs, badges
  - `--radius-md`: calc base − 2px (8px) — secondary buttons, chips
  - `--radius-lg`: base (10px) — cards
  - `--radius-xl`: base + 4px (14px) — feature cards
  - `--radius-2xl`: base + 8px (18px) — canvas cards
  - `--radius-3xl`: base + 12px (22px) — auth cards
  - `--radius-4xl`: base + 16px (26px) — hero panels
- **Buttons are rounded-full** (pill). Inputs are `rounded-xl` (14px). Cards are `rounded-2xl` (18px). Do not invent new border-radius values.

## Shadows

Three-level scale, light and dark variants in `globals.css`. Use the utility classes — never inline `box-shadow`.

| Class | Use |
|---|---|
| `.shadow-surface-sm` | Subtle resting state |
| `.shadow-surface-md` | Cards, panels |
| `.shadow-surface-lg` | Modals, popovers, hero callouts |

Card-canvas uses a custom shadow: `0 8px 32px rgba(15,23,42,0.08)` (light), heavier in dark. Marketing hero/feature panels use bespoke shadows defined in their CSS classes.

## Components (utility classes, all in `globals.css`)

| Class | Purpose |
|---|---|
| `.btn-primary` | Solid CTA. Slate-900 in light, white in dark. Min 44×44. |
| `.btn-secondary` | Outline / border. Min 44×44. |
| `.btn-ghost` | Text-only, hover bg. Min 40 height, 44 width. |
| `.input-base` | All inputs. Min 44 height. Focus ring `--brand-violet/30`. |
| `.card-base` | Default card. White, slate-200 border, shadow-md. |
| `.card-base-subtle` | Same shape, lower visual weight. |
| `.card-auth` | Signed-out shells. Solid white in light, frosted glass in dark. |
| `.card-canvas` | Workspace primary card. |
| `.card-surface` / `.card-draft` / `.card-final` | Workspace state-tagged cards. |
| `.empty-state-base` | Dashed-border empty containers. |

All interactive elements meet 44×44 minimum touch target.

## Motion

- **Approach:** Intentional. Entrance staggers on landing and reader hero. Hover micro-interactions (translate-y, scale 0.98 on press). No decorative motion in the dashboard.
- **Easing:**
  - Enter (entrance, fade-in): `cubic-bezier(0.16, 1, 0.3, 1)` — soft overshoot
  - Workspace cards: `cubic-bezier(0.23, 1, 0.32, 1)`
  - General: `ease` for hover, `ease-in-out` for state morph
- **Durations:**
  - Micro / hover: 200ms
  - Card / panel entrance: 400–450ms
  - Hero stagger: 900–1000ms
  - Background drift: 14–25s (decorative only)
- **Animations available** (defined in `globals.css`):
  - `.hero-animate` / `.hero-animate-down` — hero fade-up/down with blur
  - `.reveal-up` — scroll-reveal, opacity + transform + blur(6px → 0)
  - `.ws-enter` — workspace card entrance
  - `.reader-stagger > *` — staggered children, 60ms increments
  - `.badge-shimmer` — periodic gloss sweep on badges
  - Background drift: `hero-glow-drift-1/2/3`, `proof-blob` `float-slow/medium/fast`, `scroll-logos`, `scroll-covers-up`
- **`prefers-reduced-motion`:** all animations disabled or fast-forwarded. Verified at `globals.css:1232–1241`. Mobile (`max-width: 768px`) also disables decorative drift to save battery.
- **Forbidden:** `transition: all` (always list properties), animating layout properties (`width`, `height`, `top`, `left` — use `transform` and `opacity` only, except for reveal blur).

## Conventions

- Always prefer the utility classes above over ad-hoc Tailwind. They encode our spacing, contrast, and focus rules.
- Focus rings are mandatory on all interactive elements: `focus:ring-2 focus:ring-[#907AFF]/40 focus:ring-offset-2`. Never `outline: none` without replacement.
- Use `aria-label="Theme toggle"` exactly once globally — see the singleton guard in `globals.css:424`.
- Curly quotes (`"` `"`) and the ellipsis character (`…`), not straight quotes or three dots, in all user-facing copy.
- Loading states end with `…` (`Saving…`, not `Saving...`).
- Numbers in tables and stats: `font-variant-numeric: tabular-nums`.
- Author-side may render `author-light` class to override `text-white/*` to slate in light mode (see `globals.css:1134`).

## QA mode reference

When `/design-review` runs, it grades against this document. The known convergence risks (Inter as primary, brand violet gradient, decorative blobs) are accepted choices for the MVP. Findings should focus on:

1. Inconsistent spacing (anything not on the 4px scale)
2. Inconsistent border-radius (anything not in the radius scale above)
3. Missing focus rings on interactive elements
4. Hardcoded hex outside the `--brand-*` tokens or OKLCH `--*` variables
5. Body text below 15px on desktop (or 16px on mobile)
6. Color-only encoding (no icon or label)
7. Touch targets below 44×44
8. New fonts introduced anywhere
9. New `box-shadow` values inline instead of `.shadow-surface-*` utilities
10. Decorative motion in the dashboard (decoration is for marketing/reader hero only)

## Decisions Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-04-26 | Initial DESIGN.md created from `globals.css` | Formalize existing system as source of truth before MVP launch. Audit grades against this. |
