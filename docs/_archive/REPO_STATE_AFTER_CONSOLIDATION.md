# Repo State After Consolidation

Date: 2026-03-03

mvp commit hash: `46b02dfec66aa37e824a887dce3890b8de577509`

## Trunk Decision

- `origin/mvp` is the source of truth for active development.
- All new development must branch from `mvp`.
- `main` remains production and is untouched by this consolidation step.

## Validation of mvp

- `npm run build`: PASS
- `npm run test`: PASS

## Remote Branch Audit (excluding `main`, `mvp`, `backup-before-filter`)

### Archive-only (no commits missing in `mvp`)

- `origin/claude/competent-shannon`
- `origin/claude/dreamy-rubin`
- `origin/claude/keen-austin`
- `origin/codex/backend-core-author-flow-api`
- `origin/codex/mvp-sync-1f2b377`
- `origin/codex/pr1-ai-jobs-minimal`
- `origin/codex/pr2-types-api-route`
- `origin/codex/recommendations-translation-api`
- `origin/competent-lamport`
- `origin/consolidate/fix-payments-prod`
- `origin/dev`
- `origin/feat/beta-worker-hardening`
- `origin/feat/notifications-analytics`
- `origin/fix/ci-build-stability`
- `origin/gifted-panini`
- `origin/mvp-backup-before-cleanup`
- `origin/practical-antonelli`

### Archive-only by policy (not merged further)

These branches are retained as archive references only and are not active development branches:

- `origin/chore/architecture-cleanup`
- `origin/codex/mvp-notifications-backend`
- `origin/codex/mvp-notifications-backend-src`
- `origin/consolidate/chore-architecture-cleanup`
- `origin/cursor/development-environment-setup-df5d`
- `origin/feat/clubs-polls-newsletters`
- `origin/feat/reco-translation-ux`
- `origin/fix/payments-prod`

## Repository Policy Going Forward

- `mvp` is official trunk for all ongoing work.
- All non-`mvp` / non-`main` branches are archival.
- No branch was deleted in this step.
- No history rewrite was performed (no rebase, no force push).
