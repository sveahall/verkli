/**
 * Redis-backed daily budget guardrails for workers.
 *
 * Budget units are integer "cost-units" selected by each worker:
 * - `translation`: estimated model units (roughly chars / 4).
 * - `tts`: estimated model units (roughly chars / 4).
 * - `video`: fixed per-job/render credits.
 *
 * Per-job caps are validated locally before Redis budget checks:
 * - `translation`: max chars per job.
 * - `tts`: max chars per job.
 * - `video`: max units per job.
 */

import Redis from "ioredis";
import { getRedisClientOptions } from "@/lib/env";

export type BudgetPipeline = "tts" | "translation" | "video";

export interface BudgetCheckInput {
  userId: string;
  pipeline: BudgetPipeline;
  units: number;
  jobId?: string | null;
  now?: Date;
}

export interface BudgetUsageSnapshot {
  userId: string;
  pipeline: BudgetPipeline;
  day: string;
  key: string;
  current: number;
  limit: number;
}

type JobCostUnit = "chars" | "units";

export interface JobCostCapSnapshot {
  userId: string;
  pipeline: BudgetPipeline;
  jobSize: number;
  cap: number;
  unit: JobCostUnit;
}

export interface JobCostCheckInput {
  userId: string;
  pipeline: BudgetPipeline;
  jobSize: number;
  jobId?: string | null;
}

const DEFAULT_DAILY_BUDGETS: Record<BudgetPipeline, number> = {
  tts: 500_000,
  translation: 500_000,
  video: 100,
};

const DEFAULT_JOB_COST_CAPS: Record<BudgetPipeline, number> = {
  tts: 50_000,
  translation: 1_000_000,
  video: 5,
};

const PIPELINE_JOB_COST_UNITS: Record<BudgetPipeline, JobCostUnit> = {
  tts: "chars",
  translation: "chars",
  video: "units",
};

const REDIS_RESERVE_SCRIPT = `
local key = KEYS[1]
local increment = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local ttl = tonumber(ARGV[3])

local current = tonumber(redis.call("GET", key) or "0")
if current + increment > limit then
  return {0, current}
end

local nextValue = redis.call("INCRBY", key, increment)
if redis.call("TTL", key) < 0 then
  redis.call("EXPIRE", key, ttl)
end

return {1, nextValue}
`;

// Idempotent reservation keyed on a per-job marker so that BullMQ retries of the
// SAME job do not re-charge the daily budget. The marker stores "<amount>|<dayKey>"
// so releaseBudget can refund the exact reservation later without re-deriving the
// user/day. KEYS[1]=day budget key, KEYS[2]=job marker key.
const REDIS_RESERVE_IDEMPOTENT_SCRIPT = `
local key = KEYS[1]
local marker = KEYS[2]
local increment = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local ttl = tonumber(ARGV[3])

if redis.call("EXISTS", marker) == 1 then
  return {1, tonumber(redis.call("GET", key) or "0"), 1}
end

local current = tonumber(redis.call("GET", key) or "0")
if current + increment > limit then
  return {0, current, 0}
end

local nextValue = redis.call("INCRBY", key, increment)
if redis.call("TTL", key) < 0 then
  redis.call("EXPIRE", key, ttl)
end
redis.call("SET", marker, increment .. "|" .. key)
redis.call("EXPIRE", marker, ttl)

return {1, nextValue, 0}
`;

// Refund a reservation: read the marker, decrement the exact day key it points at
// by the exact amount reserved, then delete the marker (idempotent — a second
// release is a no-op). KEYS[1]=job marker key.
const REDIS_RELEASE_SCRIPT = `
local marker = KEYS[1]
local val = redis.call("GET", marker)
if not val then
  return 0
end
local sep = string.find(val, "|", 1, true)
if not sep then
  redis.call("DEL", marker)
  return 0
end
local amount = tonumber(string.sub(val, 1, sep - 1))
local daykey = string.sub(val, sep + 1)
-- Only refund if the day key still exists. If it already expired (next UTC day),
-- the budget has already reset and there is nothing to give back — decrementing
-- would recreate a stale, non-expiring "0" key.
if amount and amount > 0 and redis.call("EXISTS", daykey) == 1 then
  local nextValue = redis.call("DECRBY", daykey, amount)
  if nextValue < 0 then
    redis.call("SET", daykey, 0, "KEEPTTL")
  end
end
redis.call("DEL", marker)
return amount or 0
`;

const touchedKeys = new Set<string>();
let sharedRedis: Redis | null = null;

function readPositiveIntEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function getPipelineLimit(pipeline: BudgetPipeline): number {
  switch (pipeline) {
    case "tts":
      return readPositiveIntEnv("TTS_DAILY_BUDGET", DEFAULT_DAILY_BUDGETS.tts);
    case "translation":
      return readPositiveIntEnv("TRANSLATION_DAILY_BUDGET", DEFAULT_DAILY_BUDGETS.translation);
    case "video":
      return readPositiveIntEnv("VIDEO_DAILY_BUDGET", DEFAULT_DAILY_BUDGETS.video);
    default:
      return DEFAULT_DAILY_BUDGETS[pipeline];
  }
}

function getPipelineJobCostCap(pipeline: BudgetPipeline): number {
  switch (pipeline) {
    case "tts":
      return readPositiveIntEnv("TTS_JOB_CAP_CHARS", DEFAULT_JOB_COST_CAPS.tts);
    case "translation":
      return readPositiveIntEnv("TRANSLATION_JOB_CAP_CHARS", DEFAULT_JOB_COST_CAPS.translation);
    case "video":
      return readPositiveIntEnv("VIDEO_JOB_CAP_UNITS", DEFAULT_JOB_COST_CAPS.video);
    default:
      return DEFAULT_JOB_COST_CAPS[pipeline];
  }
}

function getRedisClient(): Redis {
  if (sharedRedis) return sharedRedis;
  const connection = getRedisClientOptions();
  if (!connection) {
    throw new Error("[budget] REDIS_URL not set. Budget guardrails require Redis.");
  }

  sharedRedis = new Redis(connection);
  return sharedRedis;
}

function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function ttlUntilNextUtcDay(now: Date): number {
  const nextDayUtcMs = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0,
    0,
    0,
    0
  );
  // Keep key alive one extra hour for easier operational debugging.
  const ttl = Math.ceil((nextDayUtcMs - now.getTime()) / 1000) + 3600;
  return Math.max(60, ttl);
}

function normalizeUnits(units: number): number {
  if (!Number.isFinite(units) || units <= 0) return 0;
  return Math.floor(units);
}

function buildBudgetKey(userId: string, pipeline: BudgetPipeline, day: string): string {
  return `budget:${pipeline}:${userId}:${day}`;
}

// Job-scoped reservation marker. Keyed on the (stable-across-retries) job id so a
// retried job is only charged once, and refundable by (pipeline, jobId) alone.
function buildReservationMarkerKey(pipeline: BudgetPipeline, jobId: string): string {
  return `budget:reservation:${pipeline}:${jobId}`;
}

function parseScriptResult(raw: unknown): { allowed: boolean; current: number } {
  if (!Array.isArray(raw) || raw.length < 2) {
    throw new Error(`[budget] Unexpected Redis result: ${String(raw)}`);
  }
  const allowedRaw = Number(raw[0]);
  const currentRaw = Number(raw[1]);
  return {
    allowed: allowedRaw === 1,
    current: Number.isFinite(currentRaw) ? currentRaw : 0,
  };
}

export class BudgetExceededError extends Error {
  readonly details: BudgetUsageSnapshot & { jobId: string | null };

  constructor(details: BudgetUsageSnapshot & { jobId: string | null }) {
    super(
      `Budget exceeded for "${details.userId}" in pipeline "${details.pipeline}" on ${details.day}: usage ${details.current} >= limit ${details.limit}`
    );
    this.name = "BudgetExceededError";
    this.details = details;
  }
}

export class JobCostExceededError extends Error {
  readonly details: JobCostCapSnapshot & { jobId: string | null };

  constructor(details: JobCostCapSnapshot & { jobId: string | null }) {
    super(
      `Job cost exceeded for "${details.userId}" in pipeline "${details.pipeline}": job size ${details.jobSize} ${details.unit} > cap ${details.cap} ${details.unit}`
    );
    this.name = "JobCostExceededError";
    this.details = details;
  }
}

export function validateJobCost(input: JobCostCheckInput): JobCostCapSnapshot {
  const userId = input.userId?.trim();
  if (!userId) {
    throw new Error("[budget] userId is required");
  }

  const cap = getPipelineJobCostCap(input.pipeline);
  const jobSize = normalizeUnits(input.jobSize);
  const unit = PIPELINE_JOB_COST_UNITS[input.pipeline];
  const jobId = input.jobId ? String(input.jobId) : "unknown";

  if (jobSize > cap) {
    console.warn(
      `[budget] job-cap exceeded userId=${userId} pipeline=${input.pipeline} jobSize=${jobSize} cap=${cap} unit=${unit} jobId=${jobId}`
    );
    throw new JobCostExceededError({
      userId,
      pipeline: input.pipeline,
      jobSize,
      cap,
      unit,
      jobId,
    });
  }

  return {
    userId,
    pipeline: input.pipeline,
    jobSize,
    cap,
    unit,
  };
}

/**
 * Reserve budget units before executing AI work.
 * Uses Redis atomically (INCRBY + EXPIRE) with per-day UTC keys.
 */
export async function checkBudget(input: BudgetCheckInput): Promise<BudgetUsageSnapshot> {
  const userId = input.userId?.trim();
  if (!userId) {
    throw new Error("[budget] userId is required");
  }

  const now = input.now ?? new Date();
  const day = utcDay(now);
  const key = buildBudgetKey(userId, input.pipeline, day);
  const limit = getPipelineLimit(input.pipeline);
  const units = normalizeUnits(input.units);
  const rawJobId = input.jobId ? String(input.jobId) : null;
  const jobId = rawJobId ?? "unknown";
  const redis = getRedisClient();

  touchedKeys.add(key);

  if (units <= 0) {
    const rawCurrent = await redis.get(key);
    const current = Number(rawCurrent ?? "0");
    if (current >= limit) {
      console.warn(
        `[budget] exceeded userId=${userId} pipeline=${input.pipeline} day=${day} key=${key} current=${current} limit=${limit} jobId=${jobId}`
      );
      throw new BudgetExceededError({
        userId,
        pipeline: input.pipeline,
        day,
        key,
        current,
        limit,
        jobId,
      });
    }
    return { userId, pipeline: input.pipeline, day, key, current, limit };
  }

  // With a stable jobId, reserve idempotently via a per-job marker so BullMQ
  // retries of the same job never re-charge the daily budget. Without one, fall
  // back to the plain (non-idempotent) reservation.
  const raw = rawJobId
    ? await redis.eval(
        REDIS_RESERVE_IDEMPOTENT_SCRIPT,
        2,
        key,
        buildReservationMarkerKey(input.pipeline, rawJobId),
        String(units),
        String(limit),
        String(ttlUntilNextUtcDay(now))
      )
    : await redis.eval(
        REDIS_RESERVE_SCRIPT,
        1,
        key,
        String(units),
        String(limit),
        String(ttlUntilNextUtcDay(now))
      );
  if (rawJobId) {
    touchedKeys.add(buildReservationMarkerKey(input.pipeline, rawJobId));
  }
  const parsed = parseScriptResult(raw);

  if (!parsed.allowed) {
    console.warn(
      `[budget] exceeded userId=${userId} pipeline=${input.pipeline} day=${day} key=${key} current=${parsed.current} limit=${limit} jobId=${jobId}`
    );
    throw new BudgetExceededError({
      userId,
      pipeline: input.pipeline,
      day,
      key,
      current: parsed.current,
      limit,
      jobId,
    });
  }

  return {
    userId,
    pipeline: input.pipeline,
    day,
    key,
    current: parsed.current,
    limit,
  };
}

/**
 * Refund a job's reserved budget. Call this exactly once when a job TERMINALLY
 * fails (retries exhausted or stalled out) so a failed job does not permanently
 * consume the user's daily allowance. Idempotent (a second call is a no-op) and
 * best-effort: it never throws, so a refund failure cannot mask the job error.
 * Returns the number of units refunded (0 if nothing was reserved).
 */
export async function releaseBudget(input: {
  pipeline: BudgetPipeline;
  jobId: string | null | undefined;
}): Promise<number> {
  const jobId = input.jobId ? String(input.jobId) : null;
  if (!jobId) return 0;
  try {
    const redis = getRedisClient();
    const marker = buildReservationMarkerKey(input.pipeline, jobId);
    const raw = await redis.eval(REDIS_RELEASE_SCRIPT, 1, marker);
    const released = Number(raw);
    return Number.isFinite(released) ? released : 0;
  } catch (error) {
    console.error("[budget] releaseBudget failed", {
      pipeline: input.pipeline,
      jobId,
      message: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
}

export async function getUsage(input: {
  userId: string;
  pipeline: BudgetPipeline;
  now?: Date;
}): Promise<BudgetUsageSnapshot> {
  const userId = input.userId?.trim();
  if (!userId) {
    throw new Error("[budget] userId is required");
  }
  const now = input.now ?? new Date();
  const day = utcDay(now);
  const key = buildBudgetKey(userId, input.pipeline, day);
  const redis = getRedisClient();
  const raw = await redis.get(key);
  const current = Number(raw ?? "0");
  const limit = getPipelineLimit(input.pipeline);
  return {
    userId,
    pipeline: input.pipeline,
    day,
    key,
    current: Number.isFinite(current) ? current : 0,
    limit,
  };
}

/**
 * For tests only.
 */
export async function resetAllBudgets(): Promise<void> {
  if (!sharedRedis) {
    touchedKeys.clear();
    return;
  }
  if (touchedKeys.size > 0) {
    await sharedRedis.del(...Array.from(touchedKeys));
  }
  touchedKeys.clear();
}
