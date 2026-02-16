# i18n migration notes

This document is intentionally short: the old migration inventory is no longer current.

## Current baseline

- Default product copy is English.
- Reader/public surfaces are guarded by `check:english-default`.
- Placeholder language is blocked by `check:no-placeholders`.
- Dead/unused locals and params are blocked by `check:dead-code`.

## Maintenance checks

Run these before merge:

```bash
npm run -w @verkli/web check:english-default
npm run -w @verkli/web check:no-placeholders
npm run -w @verkli/web check:dead-code
```

## If we re-introduce full i18n later

1. Add a typed key-based dictionary layer first.
2. Migrate shared/global UI strings before feature-level copy.
3. Keep English as fallback for missing keys.
4. Add CI checks that fail on missing keys per locale.
