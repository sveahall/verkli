# Worker Production Deployment — Sprint 0.5 Task 5

> Status: **runbook + recommendation only.** See
> `docs/sprint-0.5-deferred.md` §D4 for why the actual deployment build
> is deferred.

The 7 BullMQ workers (`import`, `translation`, `audiobook`,
`social-publish`, `recommendations`, `marketing`, `notifications`) need a
production runtime that:

1. Restarts on crash.
2. Holds long-running Node processes (so they can keep BullMQ workers
   alive between jobs — Vercel functions don't fit).
3. Has a graceful shutdown path so in-flight jobs complete.
4. Surfaces logs to Sentry and the structured logger
   (`apps/web/src/lib/logger.ts`).

---

## Recommendation: **Fly.io**

| Requirement | Fly.io delivery |
|---|---|
| Long-running Node | Yes — `processes` block in `fly.toml` |
| Auto-restart | `restart_policy = "on-failure"` (3 retries, then exponential backoff) |
| Per-worker scaling | One Fly service per queue, independent `min_machines` / `max_machines` |
| Graceful shutdown | Fly sends `SIGINT` then `SIGTERM` after `grace_period`; our `start-workers.ts` already handles both |
| Region pinning | Same region as Upstash + Supabase to minimise queue latency |
| Cost | Pay for what you run; idle queues can `min_machines = 0` |

### Why not the alternatives

- **Render** — fine, slightly more expensive at our scale, and slower deploys.
- **Railway** — okay, but free-tier kicks scale-to-zero in ways BullMQ
  workers don't tolerate.
- **k8s** — operationally heavy; worth it at 50+ services, not 7.
- **Vercel Functions** — wrong shape; functions die between requests.

---

## Architecture sketch

```
Fly.io project: verkli-workers
├── service: worker-import          (recommended: 1 machine, 256MB)
├── service: worker-translation     (1 machine, 1GB — Opus MT subprocess)
├── service: worker-audiobook       (1 machine, 2GB — Qwen3 + ffmpeg)
├── service: worker-social-publish  (1 machine, 256MB)
├── service: worker-recommendations (1 machine, 256MB)
├── service: worker-marketing       (1 machine, 1GB — Higgsfield + Runway calls)
└── service: worker-notifications   (1 machine, 256MB)
```

Single Dockerfile shared by all 7 services, with `CMD` overridden per
service:

```dockerfile
# apps/web/Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
COPY apps/web/package*.json ./apps/web/
RUN npm ci --workspace=apps/web --include=dev=false
COPY . .
ENV NODE_ENV=production
ENV LOG_LEVEL=info
# Default; each Fly service overrides via [processes] in fly.toml
CMD ["npm", "run", "-w", "@verkli/web", "start-workers"]
```

Per-service `fly.toml` snippet:

```toml
app = "verkli-worker-import"
primary_region = "ams"

[processes]
  app = "npx tsx apps/web/scripts/import-worker.ts"

[[services]]
  internal_port = 0
  protocol = "tcp"
  auto_stop_machines = false
  auto_start_machines = true
  min_machines_running = 1

[restart]
  policy = "on-failure"
  retries = 3
```

(`internal_port = 0` because workers don't expose HTTP — Fly's edge does
not need to route to them.)

---

## Verification checklist (post-deploy)

The original Sprint 0.5 task asked for:

- [ ] All 7 queues start. Verify with `fly status -a verkli-worker-<name>`
      for each, plus the new `/admin/queues` dashboard.
- [ ] Jobs picked up. Trigger a small test job per queue (notification ping,
      recommendations recompute for a single user, etc.) and confirm it
      moves from `waiting` → `active` → `completed` on the dashboard.
- [ ] Killed worker auto-restarts. `fly machine kill <id> -a verkli-worker-import`,
      observe Fly bring up a replacement within 30s.

A `scripts/verify-workers.ts` helper that performs these three checks
programmatically is a reasonable Sprint 1 addition.

---

## Logging

`apps/web/src/lib/logger.ts` (Pino) is the destination for all worker
output. The `loggerForJob({ queue, jobName, jobId })` helper attaches
correlation ids per job. Fly captures stdout/stderr; ship to Sentry via
the Pino multistream already wired in `getLogger()` (production-only path).

---

## Rollback

Deploy via `fly deploy -a verkli-worker-<name> --image-label v<n>`. Roll
back with `fly releases rollback -a <name> --version <n-1>`. BullMQ jobs
that were active during a deploy auto-recover via the `stalledInterval`
mechanism described in `docs/INFRASTRUCTURE.md` §6.

---

## What's deferred

The actual `Dockerfile`, `fly.toml` files, and `verify-workers.ts` script.
See `docs/sprint-0.5-deferred.md` §D4 for the unblocker — primarily a Fly
account + decision sign-off from the team.
