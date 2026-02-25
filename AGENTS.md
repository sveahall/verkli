# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

Verkli is a book publishing/reading platform built as an npm workspace monorepo (Node.js v22). The main service is a Next.js 16 web app (`apps/web`). There is also a placeholder worker (`apps/worker`) that is not yet implemented.

### Key commands

| Task | Command |
|------|---------|
| Install deps | `npm install` (from repo root) |
| Generate Prisma client | `npm run generate -w @verkli/db` |
| Dev server | `npm run dev` (starts Next.js on port 3000) |
| Lint | `npm run lint` |
| Build | `npm run build` |

### Environment variables

The app requires Supabase credentials to enable auth and database features. Without real credentials, public/marketing pages still render correctly. Create `apps/web/.env.local` from `apps/web/.env.example` and `.env` from `.env.example` at repo root. The key variables needed for full functionality are `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `DATABASE_URL`, and `DIRECT_URL`.

### Gotchas

- After `npm install`, you **must** run `npm run generate -w @verkli/db` to generate the Prisma client before starting the dev server or building, otherwise `@prisma/client` imports will fail.
- The root `/` page uses `localStorage` to remember the selected role (`author`/`reader`) and auto-redirects. Clear `localStorage` or use an incognito window to see the role-selection page again.
- ESLint has pre-existing errors (22 errors, 85 warnings as of initial setup). `npm run lint` exits with code 1 due to these — this is the baseline state of the repo, not a setup issue.
- The `apps/worker` package is a placeholder — it only logs "Worker is running" and does not process any jobs.
- Redis (via `infra/docker/docker-compose.yml`) is only needed for the worker queue (phase 2) and is not required for web development.
