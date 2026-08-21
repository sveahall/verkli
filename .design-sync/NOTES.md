# design-sync notes — verkli-web

Repo-specific gotchas for syncing `apps/web/src/components/ui` to claude.ai/design.
Read this before any re-sync. Project: `002f73a7-a6db-4be2-bab6-30fac6377cc7`
("Verkli Design System").

## Shape: `package`, synth-entry mode

- There is **no Storybook** anywhere in this repo (no `.storybook/`, no `*.stories.*`).
- There is **no design-system package**. `packages/ui` (`@verkli/ui`) is an empty stub
  that `export {}`s — do not point the sync at it. The real system is
  `apps/web/src/components/ui` (16 impl files), tokens in `apps/web/src/app/globals.css`,
  written spec in `/DESIGN.md`.
- `@verkli/web` has no `main`/`module`/`exports` and `next build` emits `.next`, not a
  consumable entry, so the converter runs in **synth-entry mode** (`[NO_DIST]` is expected,
  not an error). `.d.ts` prop contracts are inferred from source, so they are weaker than a
  real build would give. There is no `buildCmd`; don't invent one.

## PKG_DIR is the workspace symlink — path depths are counter-intuitive

`PKG_DIR = <root>/node_modules/@verkli/web` (npm workspaces symlink → `apps/web`).
`cfgPath` does **string** math from there, so escaping to the repo root takes **three**
`../` segments, not two (the `@verkli` scope dir adds a level):

- `../../../DESIGN.md` → `<root>/DESIGN.md` ✓
- `../../DESIGN.md` → `<root>/node_modules/DESIGN.md` ✗ (silently "not found — skipped")

Also: **`cssEntry` is bounded to `pkgRoot`, not workspaceRoot** — the compiled stylesheet
MUST live inside `apps/web/`. That is why it is written to `apps/web/.ds-css/`
(gitignored) rather than under `.design-sync/`.

## Tailwind v4: globals.css is SOURCE, not a stylesheet

`globals.css` starts with `@import "tailwindcss"` — pointing `cssEntry` at it directly
ships a file with zero utility classes. It must be compiled first:

```sh
./.design-sync/build-css.sh    # -> apps/web/.ds-css/ds-tailwind.css (~436 KB)
```

- **Run this before EVERY `package-build.mjs` / `preview-rebuild.mjs` run.** Tailwind only
  emits utilities it finds in scanned content, and `.design-sync/previews/*.tsx` are scanned
  sources (`@source` in `.design-sync/tailwind-entry.css`). Author a preview that uses a
  utility no component uses, skip the recompile, and that preview renders unstyled.
- The CLI is pinned to **4.1.18** in `.ds-sync` to match the repo's `tailwindcss` exactly.
  `@tailwindcss/cli@4` floats (resolved 4.3.3) — don't let it; a version skew means the DS
  renders with different CSS than the app.
- `.design-sync/tailwind-entry.css` also defines `--font-inter`. The app sets that var via
  `next/font` on `<html>`; nothing sets it outside a Next host, so without it every rule
  reading `var(--font-inter)` falls through to the generic sans stack.

## next/link and next/navigation must be shimmed (this one is load-bearing)

`breadcrumbs.tsx` imports `next/link`; `ErrorBanner.tsx` imports `next/navigation`.
Bundling the real modules drags in Next's client router, which touches
`process.env.__NEXT_MANUAL_CLIENT_BASE_PATH` at **module scope**. One undefined `process`
throws while the IIFE is still evaluating, so `window.VerkliUI` is never assigned and
**all 40 components die** — `[BUNDLE_EXPORT] 41/41 not a component`, plus
`ReferenceError: process is not defined` on every single card. Symptom looks global and
catastrophic; cause is two imports.

Fix (no lib fork needed): `cfg.tsconfig` points at **`.design-sync/tsconfig.ds.json`**, not
the app's tsconfig. `tsconfigPathsPlugin` builds its esbuild filter from the `paths` keys
and fires on bare specifiers too, so `paths` entries redirect `next/link` and
`next/navigation` to `.design-sync/shims/`. That tsconfig must keep `@/*` → `./src/*` or
every `@/lib/utils` import breaks.

Watch the `baseUrl` math: `base = resolve(dirname(tsconfig), baseUrl)` = `apps/web`, so the
shim targets need `../../.design-sync/...` from there.

Bundle size is the tell: **152 KB shimmed vs 398 KB unshimmed**. A sudden jump back toward
~400 KB means the shims stopped resolving.

## Two components need explicit help — and one is unfixable from here

- **`BrandGradientText`** uses `export default`. ESM `export *` (which is all the synth
  entry does) does **not** re-export `default`, so it was silently missing from
  `window.VerkliUI`. Recovered by a named re-export in `.design-sync/ds-shims.tsx`, wired
  via `cfg.extraEntries`. Unambiguous, so the bundle footer's `Object.assign` of the main
  namespace can't clobber it.
- **`Skeleton` is EXCLUDED** (`cfg.componentSrcMap: {"Skeleton": null}`) and cannot be
  recovered by any config. It is exported from **both** `ui/states.tsx` and
  `ui/Skeleton.tsx`. ESM drops ambiguous star re-exports, so the name vanishes from the
  main entry — and it would be ambiguous between a shim and the main entry too, so
  shimming it fails the same way. Verified absent at runtime (`'Skeleton' in window.VerkliUI`
  === false) before excluding.
  **The real fix is a one-line rename in the repo** (rename one of the two exports, e.g.
  `states.tsx`'s → `SkeletonBlock`), after which drop the `componentSrcMap` entry and it
  syncs normally. Both are live today: 38 files import from `@/components/ui/states`,
  25 from `@/components/ui/Skeleton`.
- Related smell, not touched: `Skeleton.tsx` and `states.tsx` look like **two generations of
  the same loading system** (`LoadingWrapper` vs `LoadingState`, `SkeletonCard` vs
  `CardSkeleton`). Worth consolidating someday.

## Fonts

`[FONT_MISSING] "Inter"` fires because the app loads Inter through `next/font/google` at
runtime — there is no `@font-face` to ship, and claude.ai/design is not a Next host, so
every design would silently render in a fallback font.

Resolved by extracting Inter from the app's **own** build output:
a hashed CSS chunk under `apps/web/.next/static/chunks/` holds 7 `@font-face` rules pointing at
hashed woff2 in `apps/web/.next/static/media/`. Those are copied to
`.design-sync/fonts/inter-{0..6}.woff2` (214 KB) with a rewritten
`.design-sync/fonts/inter.css`, wired via `cfg.extraFonts`. Inter is OFL-1.1.

**To regenerate** (needed if the font subsets ever change): run a production build so
`.next/static/media` is populated, then `grep -l 'font-family:Inter' apps/web/.next/static/chunks/*.css`
to find the chunk (the filename is a content hash — it changes every build), copy each
`url(../media/…)` target into `.design-sync/fonts/`, and rewrite the urls to `./inter-N.woff2`. `Montserrat_Alternates` is also loaded in `layout.tsx` but is **not**
referenced by `globals.css`, so it is deliberately not shipped.

## Component bugs found while verifying previews — ALL THREE FIXED 2026-08-21

These were defects in `apps/web/src/components/ui`, surfaced because the render check
screenshots every component in isolation. All three were class-ordering problems, and all
three are now fixed in source (lint clean, 1323 tests pass, `next build` green). Kept here
because the *shapes* of these bugs will recur in this codebase — see the general lesson at
the end of the section.

1. **`dialog.tsx` — a Dialog mounted with `open={true}` never opens.**
   `Dialog` returns `null` until a `setMounted(true)` effect runs, so on the first render
   `dialogRef.current` is `null` and the `[open]` effect bails at `if (!dialog) return;`.
   Because `open` never *changes*, that effect never re-runs and `showModal()` is never
   called. Verified in headless chromium: the `<dialog>` is in `document.body` with the
   right content but `dialog.open === false` and a 0×0 box.
   Only a `false -> true` transition after mount opens it — which is what the app does
   (a click), so the app is unaffected. It bites anything that renders an already-open
   dialog (previews, SSR-ish first paint, tests).
   **FIXED:** `mounted` added to the effect's dep array in `dialog.tsx`. The Dialog previews
   were consequently simplified back to plain `open` — no `useOpenAfterMount` workaround
   remains. If a Dialog card ever goes blank again, this regression is the first thing to
   check.

2. **`input.tsx` — `startIcon` overlaps the input text.**
   In the `cn()` call, `startIcon && "pl-10"` comes BEFORE `sizeStyles[inputSize]`
   (`"h-11 px-3.5 …"`). `tailwind-merge` treats `px-*` as conflicting with `pl-*` and keeps
   the later one, so `pl-10` is dropped and the absolutely-positioned icon sits on top of
   the value. `pr-10` vs `px-*` has the same problem for `endIcon`, visible once the value
   is long enough to reach the right edge.
   **`SearchInput` always sets a `startIcon`, so every search field in the app renders with
   the magnifier over the placeholder.** This is the most user-visible of the three.
   **FIXED:** `sizeStyles[inputSize]` moved before the `pl-10`/`pr-10` entries in the `cn()`
   call, with a comment saying why the order matters.

3. **`textarea.tsx` — the `invalid` prop has no visible effect.**
   `cn("input-base …", invalid && "border-red-500/70 …")`. `input-base` is a custom
   `@layer utilities` class from `globals.css` that sets `border-color: var(--color-slate-200)`.
   `tailwind-merge` cannot dedupe it against `border-red-500/70` because it is not a
   recognised Tailwind utility, so BOTH land on the element — and `.input-base` is emitted
   later in the compiled CSS (char ~394k vs ~66k), so at equal specificity it wins.
   **FIXED:** the invalid branch now uses Tailwind v4 trailing important modifiers
   (`border-red-500/70!`, `text-red-700!`, `placeholder:text-red-400!`, plus the focus and
   dark variants). `Textarea`'s preview has an `Invalid` cell again.
   Note this repo had **no** prior important-modifier usage — v4 syntax is the trailing `!`,
   not v3's leading `!`.

General lesson for this DS: **custom `@layer utilities` classes (`input-base`, `card-base`,
`btn-*`) are invisible to `tailwind-merge`.** Any Tailwind utility meant to override one of
them needs specificity or `!`, not just a later position in the `cn()` argument list.

## Known render warns (triaged as legitimate — a warn NOT in this list is new)

- `! [EXPORT_COLLISION] … ds-shims.tsx exports 1 name(s) the main package also exports:
  BrandGradientText` — **false positive.** The build's static export scan sees
  `export default function BrandGradientText` in the source; at runtime the main namespace
  has no such key (defaults aren't star-exported), so the shim's binding is what lands.
  Verified at runtime. Do not "fix" by renaming the shim export — that breaks the component.
- `[NO_DIST] no built entry — synthesizing from 16 src files` — expected, see above.
- `[DOCS_UNMAPPED]` for all components — there are no per-component doc files in this repo;
  `.prompt.md` is synthesized from `.d.ts` + previews. Not worth authoring docs for.
- `[RENDER_BLANK]` / `[RENDER_THIN]` on bare container sub-parts (`CardHeader`,
  `CardContent`, `CardFooter`, `DialogHeader`, `DialogBody`, `DialogFooter`, `TableHead`,
  `TableCell`) before their previews are authored — these render an empty `<div>` with no
  children by construction. Fixed by authoring the preview as the **full parent
  composition** (a real `Card`, a real `Table`), which is the only true render anyway.

## Grouping

Every component lands in group `general`. `srcDir` is `src/components/ui`, so every file
sits directly in the source root and there is no directory segment to derive a group from
(and `ui` is in the converter's `GENERIC_DIR` skip list anyway). To group properly, point
`cfg.docsMap.<Name>` at a stub `.md` containing only `---\ncategory: <Group>\n---`.
Not done in the first sync — flagged as a possible improvement.

## Environment

- npm workspaces, `package-lock.json`. **`npm ci` was deliberately skipped**: `node_modules`
  was already populated and `npm ls` clean, and a full reinstall of this monorepo is slow and
  would churn the working tree for no gain. If you hit `[UNRESOLVED_IMPORT]`, run it then.
- `--node-modules` must be the **repo root** `./node_modules`. `apps/web/node_modules` is
  sparse (only `@supabase`, `@vercel`, `dotenv`, `zod` — no `react`), so passing it fails.
- esbuild's postinstall is blocked by this npm's `allow-scripts` policy. Harmless — the
  `@esbuild/darwin-arm64` optional dep supplies the binary. Verify with a `transform()` call,
  not by trusting the warning.
- playwright pinned to **1.58.2** in `.ds-sync` to match the repo's `@playwright/test`;
  chromium build **1208**. Nothing was cached before this sync.

## What this first sync decided (2026-08-21)

- **40 components** synced, all `group: general`. `Skeleton` excluded (see above), so 40 not 41.
- **26 authored previews**, all cells graded `good`. **14 deliberately on the floor card**:
  `CardSkeleton`, `DialogDescription`, `DialogTitle`, `ErrorBannerWrapper`, `LoadingWrapper`,
  `SkeletonBookItem`, `SkeletonBooksList`, `SkeletonCard`, `SkeletonText`, `StatCardSkeleton`,
  `TableBody`, `TableHeader`, `TableRow`, `ToastProvider`. These are the standing offer for
  incremental authoring on any later re-sync — authored files and grades carry forward.
- `cfg.overrides` sets `cardMode: "single"` plus an explicit `viewport` for `Dialog`,
  `DialogHeader`, `DialogBody`, `DialogFooter`. Native `<dialog>` + `showModal()` renders in
  the browser top layer and escapes a normal grid cell; single-story cards contain it.
- No subagent fan-out was used, so there is no `.design-sync/learnings/` to merge.
- Grades live in the gitignored `.design-sync/.cache/review/`. Durable verification carries
  through the uploaded `_ds_sync.json`, so a fresh clone re-verifies nothing already uploaded.
- `.design-sync/conventions.md` was authored this run and every class, token, component and
  hook it names was grep-verified against the built bundle and CSS. Re-run that validation on
  each sync rather than trusting it — the header is prepended verbatim into the design agent's
  system prompt, so a stale name there silently teaches wrong vocabulary.

## Re-sync risks (what can silently go stale)

- **Stale compiled CSS is the #1 risk.** `apps/web/.ds-css/ds-tailwind.css` is gitignored
  build output. On a fresh clone it does not exist and `cssEntry` resolves to nothing —
  the build then reports `[CSS_PLACEHOLDER]`/unstyled cards. Always run
  `./.design-sync/build-css.sh` first. It is NOT wired into the converter.
- **The Inter woff2 are copied artifacts**, not generated. They will not track a Google
  Fonts revision or a change to `subsets`/`weight` in `layout.tsx`. If Inter's rendering
  looks off, re-extract.
- **The `next/*` shims are hand-written against Next 16.** If a component starts importing
  another `next/*` module (`next/image` is the likely next one), it will drag the router in
  again and kill the whole bundle. The fix is another `paths` entry + shim, not a lib fork.
- **`Skeleton` stays missing** until the repo renames one of the two exports. Anyone reading
  the DS pane will notice the gap; that is intentional and documented above.
- `.design-sync/tsconfig.ds.json` duplicates the app's `@/*` alias. If `apps/web/tsconfig.json`
  ever adds a path alias that `components/ui` uses, this file must be updated too — nothing
  cross-checks them.
- Component discovery is by **PascalCase value export**, so any new PascalCase export added
  to `components/ui/*.tsx` is picked up automatically — including things that aren't
  components. Check the `components:` count against the previous run.
