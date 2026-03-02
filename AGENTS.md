# Agent guide – Verkli Web

Guidance for AI agents and developers working in this repo.

## Repo layout

- **Monorepo** (npm workspaces): `apps/*`, `packages/*`.
- **App**: `apps/web` (Next.js) – main entry; `apps/worker` for background jobs.
- **Shared**: `packages/db` (`@verkli/db`), `packages/shared` (`@verkli/shared`).

## Update / bootstrap

- **`npm run update`** (root): runs `npm install` then `npm run generate -w @verkli/db`. Use this for a minimal, idempotent bootstrap after clone or when deps change.
- **`@verkli/db`** has a **`generate`** script that is intentionally a no-op (idempotent). Real DB types are generated in `apps/web` (see below). Do not add heavy or non-idempotent work to `packages/db`’s `generate` without updating this doc and the intent of `update`.

## Key gotchas

### No Prisma

- **Data layer is Supabase only.** There is no Prisma; `packages/db` is a thin Supabase-oriented package (see `packages/db/src/index.ts`).
- **`check:no-prisma`** (root script) fails if `@prisma/client` or `prisma` appears under `node_modules`. Do not introduce Prisma. Ignore or refactor any remaining references (e.g. `packages/db/load-env-and-migrate.cjs` still mentions Prisma and is legacy).

### Supabase types

- **Generated types** live in **`apps/web/src/lib/supabase/types.ts`** (and optionally `types-generated.ts`). They are produced by Supabase CLI from the remote project (or local DB), not from `@verkli/db`.
- **Generate types** from the **web app**: `npm run generate:types` in `apps/web` (or `npm run generate:types -w @verkli/web` from root). Requires `SUPABASE_PROJECT_ID` or `NEXT_PUBLIC_SUPABASE_URL`. See `apps/web/SUPABASE_TYPES.md` and `apps/web/scripts/generate-types.ts`.
- Do not edit `types.ts` by hand; regenerate after schema/migration changes.

### Migrations

- **Supabase migrations** live under **`packages/db/supabase/migrations/`**. Apply them via Supabase (remote or local), not via Prisma.

### Workspace scripts

- Use **`-w @verkli/web`** (or the appropriate workspace name) when running app-specific scripts from the repo root. The **`update`** script only runs `generate` in `@verkli/db`; other codegen (e.g. Supabase types) is under `@verkli/web`.

## Summary

| Task              | Where / command |
|-------------------|------------------|
| Bootstrap deps    | `npm run update` (root) |
| DB “generate”     | `npm run generate -w @verkli/db` (no-op, idempotent) |
| Supabase types    | `npm run generate:types -w @verkli/web` (see SUPABASE_TYPES.md) |
| No Prisma         | Enforced by `check:no-prisma`; do not add Prisma. |
