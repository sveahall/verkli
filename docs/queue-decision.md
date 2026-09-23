# Sprint 0 — Async Job Queue: Decision

> Date: 2026-04-29
> Status: **Decided — keep BullMQ. Skip Inngest / Trigger.dev migration.**

## Context

Sprint 0 asked: "Add an async job queue. Recommend Inngest or Trigger.dev based
on stack. Implement on-demand job: 'send welcome email' triggered on user
creation."

The request assumed the codebase had no queue. It does.

## Existing state (read-only audit)

- **`bullmq@^5` + `ioredis@^5`** in `apps/web/package.json`.
- **7 named queues** (canonical list in `apps/web/src/lib/queue-names.ts`):
  - `book-import-extract`
  - `book-translation`
  - `audiobook-generation`
  - `social-publish`
  - `recommendations`
  - `notifications`
  - `marketing-campaign`
- **7 worker scripts** under `apps/web/scripts/`: `import-worker.ts`,
  `translation-worker.ts`, `audiobook-worker.ts`, `social-publish-worker.ts`,
  `recommendations-worker.ts`, `marketing-worker.ts`,
  `notifications-worker.ts`, plus the unified `start-workers.ts` runtime and
  the legacy `combined-worker.ts`.
- **Production runbook**: `docs/workers-runbook.md`, `docs/workers-local.md`,
  `docker-compose.workers.yml`, `infra/docker/docker-compose.yml`.
- **Pipelines validated** end-to-end per `docs/BASELINE_SYSTEM_STATE.md`:
  `import → translate → audiobook` is the production-critical chain.

## Why we are NOT migrating to Inngest or Trigger.dev

1. **Migration is destructive.** Replacing BullMQ requires:
   - rewriting 7 worker entry points,
   - re-implementing dedupe / retry / backoff per queue (currently encoded in
     `lib/*-queue.ts`),
   - re-doing operational tooling (`docker-compose.workers.yml`, deploy
     scripts, log-aggregation),
   - draining in-flight jobs without losing the `import → translate →
     audiobook` chain that is mid-soft-launch.
   None of that is "infrastructure only" — it changes application logic, the
   explicit constraint on this sprint.

2. **BullMQ already serves the production needs.**
   - Redis-backed durability ✅
   - Retry / exponential backoff ✅ (configured in `lib/*-queue.ts`)
   - Dedupe via `jobId` ✅
   - Concurrency / stall handling ✅
   - Multi-queue topology ✅
   - Local-dev parity via Docker ✅

3. **Inngest / Trigger.dev are SaaS-first.** They add a network hop, vendor
   lock-in, and per-event pricing. None of the four 2026 audit reports
   (`audit-2026-04-02-*`, `TECHNICAL_AUDIT_REPORT.md`,
   `BASELINE_SYSTEM_STATE.md`) flag the existing queue as a problem worth a
   rewrite.

4. **Sprint 0 is a foundation audit.** Adopting a parallel queue (Inngest *and*
   BullMQ) would double the surface area, double the failure modes, and split
   the operational runbook for no observable user benefit.

## What "send welcome email on user creation" actually needs

The notifications queue (`QUEUE_NAMES.NOTIFICATIONS`) and the existing
`scripts/notifications-worker.ts` already handle async messaging. Resend is
already wired (`resend@^6.9.1`). A welcome-email handler is a one-job add-on,
not a new infrastructure layer.

The trigger point for "user creation" in Supabase is:

- **Server-side:** `app/auth/callback/route.ts` after
  `exchangeCodeForSession` succeeds and a fresh profile row is created.
- **Database-side:** the `handle_new_user` trigger added in the Foundation
  migration (per `DATABASE_ARCHITECTURE.md` §Migrations).

A clean path is: enqueue a `welcome-email` job onto the existing
`notifications` queue from the auth callback when this is the user's first
session, and let the existing worker pick it up. This is a follow-up sprint
task; **Sprint 0 does not implement it** because (a) it modifies the auth
callback (application logic), and (b) it requires copy + design review for
the actual email body.

## Reconsider when

- Workers begin needing fan-out / step functions across services.
- The team wants observable replay / time-travel debugging that BullMQ does
  not offer natively (Trigger.dev's strength).
- Operational burden of self-managing Redis becomes meaningful.

Until then: BullMQ stays.
