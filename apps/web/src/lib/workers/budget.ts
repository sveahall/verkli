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
  const jobId = input.jobId ? String(input.jobId) : "unknown";
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

  const raw = await redis.eval(
    REDIS_RESERVE_SCRIPT,
    1,
    key,
    String(units),
    String(limit),
    String(ttlUntilNextUtcDay(now))
  );
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
