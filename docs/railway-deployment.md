# Railway — production worker deployment

> Created 2026-08-17. Owner: @SveaHallinder.
> Supersedes `docs/worker-deployment.md` (a Fly.io recommendation that was never
> executed). Keep that file for the Fly runbook if we ever move; this file is what
> production actually uses.

## What runs where

| Concern | Platform | Notes |
|---|---|---|
| Next.js web app | **Vercel** | Unchanged. `apps/web/vercel.json`. Serves the Stripe webhook, checkout, entitlement and library — see below. |
| Postgres + Auth + Storage | **Supabase** | Unchanged. Project `glfipbnsyxowqsmcuzcm`, region `eu-west-3`. |
| Payments | **Stripe** | Unchanged. Dynamic payment methods, configured in the Stripe Dashboard — see `apps/web/src/lib/payments/stripe.ts`. |
| BullMQ workers | **Railway** | 7 Dockerized services, this document. |
| Redis (queue broker) | **Railway** | Private networking only. No public endpoint. |

Nothing was rewritten to fit Railway. Every service runs the same
`infra/docker/Dockerfile.workers` image that `docker-compose.workers.yml` builds
locally, selecting a worker with the same command. A worker that runs locally
runs on Railway.

## Deploy the minimum set first

The first hard proof is:

> real user → real purchase → correct entitlement → book in library → audiobook plays

**Only two Railway services are needed for that proof.** Verified by tracing the
purchase path: there is no job enqueue anywhere in `lib/payments/**`,
`api/stripe/**`, or `api/books/*/purchase/**`. Checkout, the Stripe webhook, the
`finalize_order_checkout_session` RPC, the entitlement gate (`canUserReadBook`)
and the library page all run on Vercel against Supabase. Audio *playback* is a
signed-URL route on Vercel reading `chapter_audio_cache`.

A worker is needed only to **generate** the audio in the first place.

### Phase 1 — the proof

| Service | Why |
|---|---|
| `redis` | Queue broker. Required by every worker. |
| `worker-audiobook` | Generates Johan's audiobook so there is something to play. |

### Phase 2 — the broader author workflow (after the proof passes)

`worker-import` (manuscript upload), `worker-notifications`,
`worker-recommendations`. Then `worker-translation`, `worker-marketing`,
`worker-social` — all three are behind feature flags that stay **OFF** for the
September launch, so they can wait. Note `worker-translation` additionally needs
a Python 3.11 venv with CTranslate2 plus OpusMT model files on disk
(`OPUSMT_PYTHON`, `OPUSMT_MODELS_DIR`); the Docker image does **not** provide
them and `apps/web/scripts/setup-opus-models.sh` is the recovery path. Do not
deploy it without solving that first.

---

## ⛔ What Svea must do before I can continue

These need an authenticated Railway session, billing, or a secret. I cannot do
them.

1. **Create the Railway account/project.** Name it `verkli-production`. Add a
   payment method — the free tier will not keep workers running continuously.
2. **Add a Redis service.** Railway's Redis template. Do **not** expose a public
   TCP proxy; private networking only.
3. **Create the two Phase 1 services** as described below, then tell me and I
   will run the verification.
4. **Confirm which Stripe key** the Vercel production environment uses (test or
   live). There is no mode guard in the code yet — see the open decision in
   `docs/plan/launch-plan-2026-09.md` §8.6.

Never paste secret values into this file, a commit, a log line, or a chat
message. Set them in the Railway service's Variables tab only.

---

## Service setup

Both Phase 1 services use identical settings except the start command.

**Source:** connect the GitHub repo `sveahall/verkli`, branch `platform`.

**Build:** set the service variable

```
RAILWAY_DOCKERFILE_PATH=infra/docker/Dockerfile.workers
```

Railway then builds that Dockerfile with the repo root as context, which is what
it expects (`docker build -f infra/docker/Dockerfile.workers .`).

**Start command per service:**

| Service | Start command | `WORKER` |
|---|---|---|
| `worker-audiobook` | `npx tsx scripts/audiobook-worker.ts` | `audiobook` |
| `worker-import` | `npx tsx scripts/import-worker.ts` | `import` |
| `worker-notifications` | `npx tsx scripts/notifications-worker.ts` | `notifications` |
| `worker-recommendations` | `npx tsx scripts/recommendations-worker.ts` | `recommendations` |

The image's `WORKDIR` is already `/app/apps/web`, so the script paths are
relative to that. Set `WORKER` too — `src/lib/env.ts:57` uses it for
worker-context detection, which relaxes the Next-server-only env assertions.

**Do not** deploy `scripts/start-workers.ts` (all 7 in one process). One worker
per service is what makes them independently restartable, independently
scalable, and independently movable to another host later.

### Variables

Every worker needs exactly three things to boot — `validateWorkerEnv()` in
`apps/web/scripts/worker-env.ts` hard-fails without them:

| Variable | Value |
|---|---|
| `REDIS_URL` | `${{Redis.REDIS_URL}}` — a Railway reference, so it tracks the Redis service and stays on the private network |
| `SUPABASE_URL` | The Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key. **Secret.** Bypasses RLS — workers need it, nothing else should have it |

`worker-audiobook` additionally needs:

| Variable | Value |
|---|---|
| `ELEVENLABS_API_KEY` | **Secret.** |
| `ELEVENLABS_VOICE_ID` | Required — `assertElevenLabsEnv()` throws without it. See the `"Ryan"` trap below. |
| `AUDIOBOOK_STORAGE_BUCKET` | Optional, defaults to `audiobooks` |
| `TTS_CONCURRENCY` | Start at `2`. Range 1–4. |
| `TTS_DAILY_BUDGET` | Defaults to 500 000 units. Set it explicitly so a runaway job cannot bill unbounded. |
| `TTS_JOB_CAP_CHARS` | Defaults to 50 000 chars/job. |
| `SENTRY_DSN` | Recommended — `scripts/sentry-worker-init.ts` is a no-op without it. |

`FFMPEG_BIN` is already baked into the image (`/usr/bin/ffmpeg`); do not set it.

> ### The `"Ryan"` trap
> `api/books/[id]/audiobook/generate/route.ts:37` has
> `DEFAULT_VOICE_ID = "Ryan"`. `"Ryan"` is a **Qwen** speaker name left over from
> a deleted TTS stack, and it is the final fallback fed to ElevenLabs. If neither
> `ELEVENLABS_VOICE_ID` nor `TTS_VOICE_ID` is set, every audiobook job 4xxs.
> Setting `ELEVENLABS_VOICE_ID` is not optional. (WP-14 removes the fallback.)

### Redis and private networking

Reference Redis as `${{Redis.REDIS_URL}}` rather than pasting a URL, so the
workers resolve `redis.railway.internal` over Railway's private network and the
broker never gets a public endpoint.

**This required a code change.** Railway's private DNS resolves to IPv6 on legacy
environments and dual-stack on newer ones, and ioredis will not reach it on the
default lookup. Railway's own BullMQ guidance is to set `family: 0` on the
connection object, so `getRedisConnectionOptions()` in `apps/web/src/lib/env.ts`
now does exactly that, unconditionally. It is inert for `localhost` and for
public hosts, which keeps the image portable to Fly or Hetzner with no further
change.

Also note: **private networking is runtime-only, not available during the build
phase.** Nothing in our build touches Redis, so this is fine — but do not add a
build step that does.

### Reliability

- **Restart policy:** `on failure`, max 10 retries. Every worker already handles
  `SIGTERM`/`SIGINT`.
- **Health:** no HTTP health check — these are queue consumers with no public
  port, which is intentional. Observe them instead through
  `GET /api/health/workers` and `/api/health/queue` on Vercel (gated by
  `OPS_HEALTH_TOKEN`), which read the worker heartbeats the workers write to
  Redis.
- **Concurrency:** leave `TTS_CONCURRENCY=2`. The audiobook worker sets a 61-minute
  lock duration; a whole book is a long job and raising concurrency mainly raises
  the ElevenLabs bill.
- **No autoscaling.** One replica per worker. Revisit only if queue lag is
  measured, not assumed.
- **Alert thresholds** already exist declaratively in `infra/alerting/alerts.yml`
  and are wired to nothing. Wiring them is a separate task.

---

## Verifying the proof

Run in order. Stop at the first failure.

1. `GET /api/health/queue` with the `x-ops-health-token` header returns 200 and
   shows the `audiobook-generation` queue present and reachable.
2. `GET /api/health/workers` shows a fresh heartbeat for the audiobook worker.
3. As an author, generate the audiobook for Johan's book. Watch the Railway logs.
   Confirm in Supabase that `chapter_audio_cache` rows appear with an
   `audio_path` ending `.mp3` — **not** `.json`. A `.json` path means ffmpeg is
   missing and the job degraded to manifest-only.
4. Confirm `books.audiobook_status = 'published'`.
5. As a reader in a clean browser session: sign up → open the book page →
   complete a real Stripe purchase → land on `/purchase/success` → find the book
   in the library → press play and hear audio.
6. Confirm in Supabase: `orders.status = 'paid'` and a matching `entitlements`
   row with `chapter_id IS NULL`.

**`PIPELINE_SMOKE_MODE` must not be set in production.** It makes the worker
write silent WAV files that are indistinguishable from real audio in the
database, and still flips `audiobook_status` to `published`. It exists for CI
only.

## Local development is unchanged

`docker-compose.workers.yml` still runs the whole stack locally, and
`npm run start-workers` still runs all 7 in one process for development. The only
change to that file was correcting `env_file` from the root `.env.local` (a decoy
that defines a Supabase variable the code never reads) to `apps/web/.env.local`,
which is the file `apps/web/scripts/load-dotenv.ts` actually loads.

## Portability

Every worker is a plain Docker image with no Railway-specific code. The only
Railway-shaped thing anywhere is `family: 0` on the Redis connection, and that is
a no-op elsewhere. Moving a workload to Fly, Hetzner or GPU compute means
pointing a new host at the same Dockerfile and giving it `REDIS_URL`.
