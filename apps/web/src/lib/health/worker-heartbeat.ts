/**
 * Worker heartbeat for crash detection.
 * Workers write a timestamp to Redis periodically; observability checks report stale or missing heartbeats.
 *
 * Env-controlled thresholds (defaults):
 * - HEARTBEAT_INTERVAL_MS=30000 — how often workers send a heartbeat
 * - HEARTBEAT_STALE_MS=180000 — after this age (ms) without heartbeat, worker is considered stale/crashed
 */

import Redis from "ioredis";
import { getRedisClientOptions, getRedisUrl } from "@/lib/env";
import { QUEUE_NAMES } from "@/lib/queue-names";

const HEARTBEAT_KEY_PREFIX = "worker:heartbeat:";
const WORKERS_STARTED_AT_KEY = "workers:startedAt";

function readPositiveIntEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000;
const DEFAULT_HEARTBEAT_STALE_MS = 180_000;

export function getHeartbeatIntervalMs(): number {
  return readPositiveIntEnv("HEARTBEAT_INTERVAL_MS", DEFAULT_HEARTBEAT_INTERVAL_MS);
}

export function getHeartbeatStaleMs(): number {
  return readPositiveIntEnv("HEARTBEAT_STALE_MS", DEFAULT_HEARTBEAT_STALE_MS);
}

/** TTL for Redis key: must exceed stale threshold so we classify by age, not expiry. */
function getHeartbeatTtlSeconds(): number {
  const staleMs = getHeartbeatStaleMs();
  return Math.ceil(staleMs / 1000) + 60;
}

function getRedisClient(): Redis | null {
  const connection = getRedisClientOptions({ lazyConnect: true });
  if (!connection) return null;

  const redis = new Redis(connection);
  redis.on("error", () => {
    // Heartbeats are best-effort; suppress noisy ioredis errors when Redis is down.
  });
  return redis;
}

/**
 * Call from a worker process periodically to signal liveness.
 * Interval is controlled by HEARTBEAT_INTERVAL_MS (default 30s).
 * Key TTL exceeds HEARTBEAT_STALE_MS so missing key implies worker down.
 */
export async function sendHeartbeat(queueName: string): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;
  try {
    await redis.connect();
    const key = `${HEARTBEAT_KEY_PREFIX}${queueName}`;
    const value = new Date().toISOString();
    await redis.setex(key, getHeartbeatTtlSeconds(), value);
  } catch {
    // Best effort; worker continues running
  } finally {
    try {
      await redis.quit();
    } catch {
      redis.disconnect();
    }
  }
}

export type HeartbeatStatus = {
  queueName: string;
  lastSeen: string | null;
  stale: boolean;
  crashed: boolean;
};

/**
 * Call from API to get current heartbeat status for all known queues.
 * stale = no heartbeat or older than HEARTBEAT_STALE_MS (default 180s).
 * crashed = stale (used for alerting).
 */
export async function getHeartbeats(): Promise<{
  redis: boolean;
  heartbeats: Record<string, HeartbeatStatus>;
}> {
  const url = getRedisUrl();
  const queueNames = Object.values(QUEUE_NAMES);
  const staleThresholdMs = getHeartbeatStaleMs();

  if (!url) {
    const heartbeats: Record<string, HeartbeatStatus> = {};
    for (const name of queueNames) {
      heartbeats[name] = {
        queueName: name,
        lastSeen: null,
        stale: true,
        crashed: true,
      };
    }
    return { redis: false, heartbeats };
  }

  const connection = getRedisClientOptions({ lazyConnect: true });
  if (!connection) {
    const heartbeats: Record<string, HeartbeatStatus> = {};
    for (const name of queueNames) {
      heartbeats[name] = {
        queueName: name,
        lastSeen: null,
        stale: true,
        crashed: true,
      };
    }
    return { redis: false, heartbeats };
  }

  const redis = new Redis(connection);
  redis.on("error", () => {
    // Heartbeats are best-effort; suppress noisy ioredis errors when Redis is down.
  });

  const heartbeats: Record<string, HeartbeatStatus> = {};
  const now = Date.now();

  try {
    await redis.connect();
    for (const name of queueNames) {
      const key = `${HEARTBEAT_KEY_PREFIX}${name}`;
      const value = await redis.get(key);
      const lastSeen = value ?? null;
      const ageMs = lastSeen ? now - new Date(lastSeen).getTime() : Infinity;
      const stale = !lastSeen || ageMs > staleThresholdMs;
      heartbeats[name] = {
        queueName: name,
        lastSeen,
        stale,
        crashed: stale,
      };
    }
    return { redis: true, heartbeats };
  } catch {
    for (const name of queueNames) {
      heartbeats[name] = {
        queueName: name,
        lastSeen: null,
        stale: true,
        crashed: true,
      };
    }
    return { redis: false, heartbeats };
  } finally {
    try {
      await redis.quit();
    } catch {
      redis.disconnect();
    }
  }
}

/**
 * Start a heartbeat interval in a worker. Call once after the worker is running.
 * Uses HEARTBEAT_INTERVAL_MS (default 30s).
 */
export function startHeartbeatInterval(queueName: string): NodeJS.Timeout {
  const intervalMs = getHeartbeatIntervalMs();
  void sendHeartbeat(queueName);
  return setInterval(() => {
    void sendHeartbeat(queueName);
  }, intervalMs);
}

/**
 * Set the workers process start timestamp in Redis (for health reporting).
 * Call from start-workers when all workers have started.
 */
export async function setWorkersStartedAt(timestampMs: number): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;
  try {
    await redis.connect();
    await redis.set(WORKERS_STARTED_AT_KEY, String(timestampMs));
  } catch {
    // Best effort
  } finally {
    try {
      await redis.quit();
    } catch {
      redis.disconnect();
    }
  }
}

/**
 * Get the workers process start timestamp from Redis (for health reporting).
 * Returns null if not set or Redis unavailable.
 */
export async function getWorkersStartedAt(): Promise<number | null> {
  const url = getRedisUrl();
  if (!url) return null;
  const connection = getRedisClientOptions({ lazyConnect: true });
  if (!connection) return null;

  const redis = new Redis(connection);
  redis.on("error", () => {
    // Best-effort status read only.
  });
  try {
    await redis.connect();
    const value = await redis.get(WORKERS_STARTED_AT_KEY);
    if (value == null) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  } finally {
    try {
      await redis.quit();
    } catch {
      redis.disconnect();
    }
  }
}
