# Infrastructure — Redis High Availability

## 1. Current State

| Component | Value |
|-----------|-------|
| Provider | Upstash (serverless Redis) |
| Topology | Single instance, no replication |
| Protocol | `redis://` (no TLS) |
| Client | `ioredis` (via BullMQ and direct) |
| Connection model | Per-module singletons + per-call ephemeral (heartbeats, health checks) |

### Redis Key Namespaces

| Namespace | Owner | Persistence requirement |
|-----------|-------|------------------------|
| `bull:*` | BullMQ queues (7 queues) | **Critical** — job state, retry counters, delayed sets |
| `budget:*` | Budget guardrails (Lua INCRBY) | **High** — cost-limiting; loss = over-spend until TTL creates new keys |
| `worker:heartbeat:*` | Worker liveness | **Low** — ephemeral, TTL-based, rebuilt on next heartbeat |
| `workers:startedAt` | Process start timestamp | **Low** — informational |
| `rl:*` | Rate limiter | **Medium** — has in-memory fallback, loss = brief rate-limit reset |

### Current Weaknesses

1. **Single point of failure** — Redis down = all queues stall, budget checks fail, heartbeats lost
2. **No TLS** — traffic between app and Upstash is unencrypted
3. **Ephemeral connections in hot paths** — `worker-heartbeat.ts` creates+destroys a connection every 30s per queue (7× workers = 14 connections/minute wasted)
4. **No reconnection strategy** — budget and rate-limit modules set `maxRetriesPerRequest: 1` with no `retryStrategy`, so a transient blip kills the shared client permanently
5. **No persistence guarantee** — Upstash free/pay-as-you-go uses best-effort persistence; no SLA on data durability

---

## 2. Architecture Proposal

### Recommended: Upstash Pro with Regional Replication

Upstash Pro provides:
- **Automatic failover** — primary/replica with promotion in <1s
- **Multi-region read replicas** (optional)
- **TLS by default** on `rediss://` endpoints
- **AOF persistence** — every write persisted before ACK
- **99.99% uptime SLA**

This is the best fit because:
- Already using Upstash — no migration, just upgrade
- Serverless pricing scales with usage (no idle cost for replicas)
- No infrastructure to manage (vs. Sentinel or ElastiCache)
- BullMQ is fully compatible (single-master writes)

### Alternative: AWS ElastiCache (if moving to AWS)

| Aspect | Upstash Pro | ElastiCache |
|--------|-------------|-------------|
| Setup | Dashboard toggle | VPC, subnet groups, security groups |
| Failover | Automatic (<1s) | Multi-AZ automatic (~15-30s) |
| TLS | Default | Configurable |
| Cost model | Per-request | Per-hour (reserved or on-demand) |
| BullMQ compat | Full | Full (single-node or cluster-mode disabled) |
| Ops burden | Zero | Medium (patching, scaling, monitoring) |

**Verdict**: Upstash Pro unless the stack moves fully to AWS. ElastiCache cluster-mode must be **disabled** for BullMQ compatibility (BullMQ uses multi-key Lua scripts that require all keys on the same shard).

### Not Recommended: Self-hosted Sentinel

- High ops burden (3 Sentinel nodes + 1 primary + 1 replica minimum)
- Manual failover tuning
- No benefit over managed offerings at this scale

---

## 3. Environment Variable Changes

### Current

```env
REDIS_URL=redis://default:...@....upstash.io:6379
```

### Target

```env
# Primary (read-write) — TLS enabled
REDIS_URL=rediss://default:...@....upstash.io:6379

# Optional: read replica for health checks (reduces primary load)
# REDIS_READ_URL=rediss://default:...@...-replica.upstash.io:6379
```

**Changes:**
1. `redis://` → `rediss://` (TLS) — Upstash Pro endpoints use TLS by default
2. Optional `REDIS_READ_URL` for read-only operations (health checks, heartbeat reads, budget usage queries)
3. No other env changes needed — all existing env vars (`TTS_DAILY_BUDGET`, `HEARTBEAT_*`, etc.) remain the same

### New Optional Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `REDIS_READ_URL` | Falls back to `REDIS_URL` | Read replica endpoint |
| `REDIS_CONNECT_TIMEOUT_MS` | `5000` | Connection timeout (increase from current 1500-2000) |
| `REDIS_MAX_RETRIES` | `3` | Max retries per request (increase from current 1) |

---

## 4. Failover Strategy

### 4.1 Provider-Side (Upstash Pro)

- Primary failure detected → replica promoted automatically
- DNS endpoint stays the same (`*.upstash.io`) — no client config change needed
- Failover window: <1 second (Upstash claims <200ms)
- Data loss window: zero (AOF persistence, synchronous replication on Pro)

### 4.2 Client-Side Behavior During Failover

During the ~1s failover window:

| System | Impact | Mitigation |
|--------|--------|------------|
| **BullMQ queues** | Enqueue calls fail; active jobs lose lock renewal briefly | BullMQ retries internally; stalled jobs auto-recover via `stalledInterval` |
| **Budget counters** | `checkBudget()` throws; worker job fails | Job retried by BullMQ retry policy; budget state survives (persisted in Redis) |
| **Heartbeats** | `sendHeartbeat()` silently fails (best-effort) | Next interval (30s) succeeds; stale threshold (180s) absorbs the gap |
| **Rate limiter** | Falls back to in-memory automatically | Existing behavior, no change needed |
| **Health checks** | Returns `redis: false` | Transient; next check succeeds after failover |
| **API enqueue** | Returns null (job not enqueued) | Existing graceful degradation; user can retry |

### 4.3 Data Durability per Namespace

| Namespace | On failover | On full Redis loss |
|-----------|-------------|-------------------|
| `bull:*` | Survives (replicated) | Jobs lost; re-trigger from app (import/translate/audiobook) |
| `budget:*` | Survives (replicated) | Counters reset to 0; users get fresh daily budget (acceptable) |
| `rl:*` | Survives (replicated) | Rate limits reset; in-memory fallback activates (acceptable) |
| `worker:heartbeat:*` | Survives | Rebuilt within 30s by workers (acceptable) |

---

## 5. Redis Client Configuration Updates

### 5.1 Shared Connection Config (recommended standard)

All ioredis instances should use these options:

```typescript
// lib/redis/connection.ts (new shared config — not a new module, just constants)
export const REDIS_CLIENT_DEFAULTS = {
  // TLS: ioredis auto-enables TLS for rediss:// URLs, no extra config needed

  // Retry: reconnect on transient failures
  maxRetriesPerRequest: 3,         // was: 1
  connectTimeout: 5000,            // was: 1500-2000
  enableReadyCheck: true,          // was: false — enable so client waits for replica promotion

  // Reconnect strategy: exponential backoff with jitter
  retryStrategy(times: number) {
    if (times > 10) return null;   // stop after 10 attempts (~30s total)
    return Math.min(times * 200, 3000) + Math.random() * 100;
  },

  // Keep-alive: detect dead connections faster
  keepAlive: 10_000,               // TCP keep-alive every 10s
} as const;
```

### 5.2 Changes Per Module

#### `lib/workers/budget.ts`
- **Current**: `maxRetriesPerRequest: 1, connectTimeout: 2000, enableReadyCheck: false`
- **Change**: Apply `REDIS_CLIENT_DEFAULTS`
- **Risk**: Low — budget is called per-job, not in a hot loop
- **Impact**: Budget checks survive transient Redis blips instead of failing permanently

#### `lib/rate-limit.ts`
- **Current**: `maxRetriesPerRequest: 1, connectTimeout: 2000, enableReadyCheck: false, lazyConnect: true`
- **Change**: Apply `REDIS_CLIENT_DEFAULTS`, keep `lazyConnect: true`
- **Risk**: Low — already has in-memory fallback
- **Impact**: Fewer unnecessary fallbacks to in-memory mode

#### `lib/health/worker-heartbeat.ts`
- **Current**: Creates a new `Redis()` on every `sendHeartbeat()` call (every 30s × 7 workers)
- **Change**: Use a module-level shared client (like `budget.ts` pattern) with `REDIS_CLIENT_DEFAULTS`
- **Risk**: Low — reduces connection churn significantly
- **Impact**: ~14 fewer connections/minute; faster heartbeats; less Upstash request overhead

#### `lib/health/checks.ts`
- **Current**: Creates ephemeral connection per health check, `connectTimeout: 1500`
- **Change**: Increase `connectTimeout: 5000` to tolerate failover window
- **Risk**: Health check takes longer to timeout (5s vs 1.5s) — acceptable for a health endpoint
- **Impact**: Fewer false-negative health reports during brief failovers

#### `lib/queues/factory.ts` (BullMQ)
- **Current**: Passes `{ host, port, password }` — no retry/timeout config
- **Change**: Merge `REDIS_CLIENT_DEFAULTS` into BullMQ connection options
- **Risk**: Low — BullMQ passes these through to ioredis
- **Impact**: Queue operations survive transient Redis blips

### 5.3 Connection Reuse Summary

| Module | Current | Target |
|--------|---------|--------|
| budget.ts | Shared singleton | Shared singleton + better retry |
| rate-limit.ts | Shared singleton | Shared singleton + better retry |
| worker-heartbeat.ts (send) | **New connection per call** | Shared singleton |
| worker-heartbeat.ts (read) | New connection per call | Shared singleton (or read replica) |
| health/checks.ts | Ephemeral per check | Ephemeral per check (keep — health checks should be independent) |
| queues/factory.ts | Per-queue singleton | Per-queue singleton + better retry |

---

## 6. Worker Reconnection Behavior

### 6.1 BullMQ Workers

BullMQ uses ioredis internally. With the `retryStrategy` configured:

1. Redis disconnects → ioredis enters reconnect loop (200ms, 400ms, 600ms... up to 3s)
2. Worker pauses processing (no new jobs picked up)
3. Active jobs: lock renewal fails → job becomes stalled after `stalledInterval`
4. Redis reconnects → worker resumes; stalled jobs re-enter queue per `maxStalledCount`
5. If reconnect fails after 10 attempts → worker process should exit and be restarted by process manager

### 6.2 Recommended: Process Manager with Auto-Restart

Workers should run under a process manager that restarts on exit:

| Environment | Tool | Config |
|-------------|------|--------|
| Docker Compose | `restart: unless-stopped` | Already works |
| Kubernetes | Deployment with `restartPolicy: Always` | Default |
| Systemd | `Restart=on-failure` | Add to unit file |
| PM2 | `--max-restarts 10` | If using PM2 |

### 6.3 Graceful Shutdown

The existing `start-workers.ts` handles SIGINT/SIGTERM. Ensure:
1. Workers call `worker.close()` on shutdown (waits for active job to finish)
2. Redis connections are closed via `redis.quit()` (flushes pending commands)
3. Process exits with code 0 (so process manager distinguishes clean stop from crash)

---

## 7. Risk Analysis

### 7.1 Migration Risks (Upstash Free → Pro)

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| DNS change during upgrade | Low | 1-5s downtime | Upstash keeps same endpoint; schedule during low-traffic |
| TLS handshake overhead | Low | ~2ms per connection | Negligible; connections are long-lived |
| Cost increase | Certain | ~$10-50/mo depending on usage | Pay-as-you-go; monitor with Upstash dashboard |
| Lua script compat | None | N/A | Same Redis version; scripts work identically |

### 7.2 Operational Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Upstash region outage | Very low | Full Redis outage | Multi-region read replicas (Upstash Pro feature) |
| Budget counter drift after failover | Very low | Brief over-spend (1 request window) | Lua script is atomic; replicated state is consistent |
| BullMQ job duplication on failover | Low | Job processed twice | Existing idempotent job IDs + processor-level dedupe |
| Worker stuck after reconnect | Low | Queue stalls | Process manager auto-restart; `stalledInterval` catches it |
| Connection leak from heartbeat refactor | Low | Redis connection exhaustion | Test heartbeat module changes; monitor connection count |

### 7.3 What We Lose If Redis Dies Completely (No Replica)

| System | Data lost | Recovery |
|--------|-----------|----------|
| Queues | All pending/active jobs | Users re-trigger operations from UI |
| Budget counters | Daily usage counts | Counters restart at 0 — temporary over-budget risk |
| Heartbeats | Worker liveness timestamps | Rebuilt within 30s automatically |
| Rate limits | Current windows | In-memory fallback activates; full reset on next window |

**Conclusion**: Total Redis loss is recoverable. No data in Redis is the source of truth for business data (that's Supabase). Redis holds only operational state that rebuilds naturally.

---

## 8. Implementation Plan

### Phase 1: Upstash Pro Upgrade (no code changes)

1. Upgrade Upstash plan to Pro in dashboard
2. Enable TLS — update `REDIS_URL` from `redis://` to `rediss://`
3. Verify all workers connect successfully
4. Enable AOF persistence (Pro default)
5. **Estimated downtime**: 0 (Upstash keeps same endpoint)

### Phase 2: Client Configuration Hardening (minimal code changes)

1. Create shared `REDIS_CLIENT_DEFAULTS` constant
2. Apply defaults to `budget.ts`, `rate-limit.ts`, `queues/factory.ts`
3. Refactor `worker-heartbeat.ts` to use shared connection (eliminate per-call connection churn)
4. Increase `connectTimeout` in `health/checks.ts`
5. **Risk**: Low — config-only changes, no logic changes

### Phase 3: Observability (optional)

1. Add Redis connection event logging (`connect`, `error`, `reconnecting` events on ioredis)
2. Add Upstash usage monitoring (requests/day, memory, latency)
3. Alert on `redis: false` in health endpoint persisting >60s

### Phase 4: Read Replica (optional, when needed)

1. Add `REDIS_READ_URL` env var
2. Route health check reads and heartbeat reads to replica
3. Reduces primary load by ~30% (health checks are frequent)

---

## 9. Decision Log

| Decision | Chosen | Reason |
|----------|--------|--------|
| Provider | Upstash Pro | Already in use; zero-ops; BullMQ compatible |
| TLS | Yes (`rediss://`) | No reason not to; Upstash supports it natively |
| Connection pooling | Module-level singletons | Matches existing pattern; ioredis handles pooling internally |
| Read replicas | Deferred | Not needed at current scale; easy to add later |
| Sentinel | Rejected | Ops overhead not justified; Upstash handles failover |
| ElastiCache | Rejected (for now) | Would require VPC setup; no AWS infra currently |
| Redis Cluster | Rejected | BullMQ Lua scripts require single-shard; cluster-mode disabled would work but adds complexity |
