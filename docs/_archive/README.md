# Archived Documentation

Historical audit + state snapshots that have been superseded by the canonical
docs at the project root.

## What lives where now

| Topic | Canonical location |
|---|---|
| Feature / route / table audit | `docs/audit.md` |
| Database schema audit (FK indexes, soft delete, audit logs) | `docs/db-audit.md` |
| Async job queue decision (BullMQ vs alternatives) | `docs/queue-decision.md` |
| Information architecture (route map) | `docs/route-map.md` |
| Database schema reference | `docs/DATABASE_ARCHITECTURE.md` |
| Production-critical async pipelines | `docs/job-pipeline-regression-tests.md` and `docs/import-pipeline.md` |
| Worker runbook | `docs/workers-runbook.md` |
| Local dev runbook | `docs/RUNBOOK_LOCAL.md` and `docs/dev-runbook.md` |

## Why archived, not deleted

These documents capture point-in-time analysis (e.g. the schema-drift
reconciliation that produced `20260322000000_missing_tables_genres_social_recommendations.sql`).
The history is sometimes load-bearing for "why did we do X?" investigations.

If you find one of these still being referenced from a runtime path, treat
that as a doc-drift bug and patch the reference to the canonical location.
