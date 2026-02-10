# CI Build

## Commands

| Command | Bundler | Use when |
|---|---|---|
| `npm run build` | Turbopack (Next 16 default) | Local dev, fast iteration |
| `npm run build:ci` | webpack (`--webpack`) | CI, deploy, release gates |
| `npm run clean` | n/a | Clear `.next` cache manually |

### Why two build commands?

Next.js 16 defaults to Turbopack for `next build`. Turbopack is faster but has
known issues with stale `.next` caches that cause non-deterministic `ENOENT`
errors (missing `_buildManifest.js`, `pages-manifest.json`). These failures are
transient and hard to debug in CI.

`build:ci` solves this by:
1. Deleting `apps/web/.next` before every build (no stale cache)
2. Using `--webpack` for deterministic, battle-tested bundling

Use `build:ci` in all CI pipelines and deploy scripts. Use `build` locally when
you want Turbopack speed and can tolerate the occasional cache issue.

## CI pipeline order

```bash
npm ci
npm run lint
npm test
npm run build:ci
```

## Case sensitivity (Linux vs macOS)

macOS uses a case-insensitive filesystem by default. Linux (and CI runners) are
case-sensitive. A file named `Input.tsx` on disk but imported as `input.tsx` will
build locally but fail in CI.

### Prevention

Set git to be case-sensitive locally:

```bash
git config core.ignorecase false
```

This makes git detect case-only renames as actual changes, catching mismatches
before they reach CI.

### Diagnosis

If CI fails with `Module not found: Can't resolve '@/components/ui/input'`:

```bash
# Check what git tracks
git ls-files -- apps/web/src/components/ui/ | grep -i input

# Check what's on disk
ls apps/web/src/components/ui/ | grep -i input

# If they differ, rename via temp file (macOS needs two-step rename)
mv apps/web/src/components/ui/Input.tsx apps/web/src/components/ui/input_tmp.tsx
mv apps/web/src/components/ui/input_tmp.tsx apps/web/src/components/ui/input.tsx
```

### Rules

- `@/components/ui/` files: always **lowercase** (`input.tsx`, `select.tsx`, `toast.tsx`)
- Component files (`ConfirmModal.tsx`, `ErrorBanner.tsx`): PascalCase is fine,
  but import paths must match exactly
- All imports must match the exact filename casing in git
