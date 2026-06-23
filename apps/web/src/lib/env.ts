/**
 * Environment variable validation
 *
 * - publicEnv: browser / Next server (NEXT_PUBLIC_* required).
 * - serverEnv: Node workers (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).
 * Worker context: BULLMQ_WORKER=1 or WORKER=true or absence of NEXT_RUNTIME.
 */

// ─────────────────────────────────────────────────────────────
// Public env (browser / Next server only)
// ─────────────────────────────────────────────────────────────

type PublicEnvVars = {
  NEXT_PUBLIC_SUPABASE_URL: string | undefined;
  NEXT_PUBLIC_SUPABASE_ANON_KEY: string | undefined;
};

type ServerEnvVars = {
  SUPABASE_URL: string | undefined;
  SUPABASE_SERVICE_ROLE_KEY: string | undefined;
  RESEND_API_KEY: string | undefined;
  RESEND_FROM_EMAIL: string | undefined;
  NEXT_PUBLIC_SITE_URL: string | undefined;
  STRIPE_SECRET_KEY: string | undefined;
  STRIPE_WEBHOOK_SECRET: string | undefined;
  PRICE_PLUS: string | undefined;
  PRICE_PRO: string | undefined;
  STRIPE_CUSTOMER_PORTAL_RETURN_URL: string | undefined;
  STRIPE_CHECKOUT_SUCCESS_URL: string | undefined;
  STRIPE_CHECKOUT_CANCEL_URL: string | undefined;
};

function readPublicEnvVars(): PublicEnvVars {
  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
}

function readServerEnvVars(): ServerEnvVars {
  return {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    PRICE_PLUS: process.env.PRICE_PLUS,
    PRICE_PRO: process.env.PRICE_PRO,
    STRIPE_CUSTOMER_PORTAL_RETURN_URL: process.env.STRIPE_CUSTOMER_PORTAL_RETURN_URL,
    STRIPE_CHECKOUT_SUCCESS_URL: process.env.STRIPE_CHECKOUT_SUCCESS_URL,
    STRIPE_CHECKOUT_CANCEL_URL: process.env.STRIPE_CHECKOUT_CANCEL_URL,
  };
}

function isWorkerContext(): boolean {
  return (
    process.env.BULLMQ_WORKER === "1" ||
    process.env.WORKER === "true" ||
    !process.env.NEXT_RUNTIME
  );
}

export function assertPublicEnv(): void {
  if (isWorkerContext()) return;

  const publicEnv = readPublicEnvVars();
  const missing: string[] = [];
  if (!publicEnv.NEXT_PUBLIC_SUPABASE_URL) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (missing.length > 0) {
    throw new Error(
      `Missing required public environment variables: ${missing.join(", ")}\n` +
        "Please set these in your .env.local file."
    );
  }
}

// ─────────────────────────────────────────────────────────────
// Server env (Next server) and worker env (Node worker)
// ─────────────────────────────────────────────────────────────

export function assertServerEnv(): void {
  const publicEnv = readPublicEnvVars();
  const serverEnv = readServerEnvVars();

  if (isWorkerContext()) {
    const missing: string[] = [];
    const url = serverEnv.SUPABASE_URL || publicEnv.NEXT_PUBLIC_SUPABASE_URL;
    if (!url) missing.push("SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL");
    if (!serverEnv.SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
    if (missing.length > 0) {
      throw new Error(
        `Missing required worker environment variables: ${missing.join(", ")}\n` +
          "Please set SUPABASE_SERVICE_ROLE_KEY and either SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL in .env.local."
      );
    }
    return;
  }

  assertPublicEnv();
  const missing: string[] = [];
  if (!serverEnv.SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!serverEnv.RESEND_API_KEY) missing.push("RESEND_API_KEY");
  if (!serverEnv.RESEND_FROM_EMAIL) missing.push("RESEND_FROM_EMAIL");
  if (!serverEnv.NEXT_PUBLIC_SITE_URL) missing.push("NEXT_PUBLIC_SITE_URL");
  if (missing.length > 0) {
    throw new Error(
      `Missing required server environment variables: ${missing.join(", ")}\n` +
        "Please set these in your .env.local file.\n" +
        "NOTE: These are server-only variables and should NEVER be exposed to the client."
    );
  }
}

// ─────────────────────────────────────────────────────────────
// Get validated env (same shape for admin client compatibility)
// ─────────────────────────────────────────────────────────────

export function getServerEnv() {
  assertServerEnv();
  const publicEnv = readPublicEnvVars();
  const serverEnv = readServerEnvVars();

  if (isWorkerContext()) {
    const url = serverEnv.SUPABASE_URL || publicEnv.NEXT_PUBLIC_SUPABASE_URL;
    return {
      SUPABASE_URL: url!,
      NEXT_PUBLIC_SUPABASE_URL: url!,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
      SUPABASE_SERVICE_ROLE_KEY: serverEnv.SUPABASE_SERVICE_ROLE_KEY!,
      RESEND_API_KEY: serverEnv.RESEND_API_KEY ?? "",
      RESEND_FROM_EMAIL: serverEnv.RESEND_FROM_EMAIL ?? "",
      NEXT_PUBLIC_SITE_URL: serverEnv.NEXT_PUBLIC_SITE_URL ?? "",
      STRIPE_SECRET_KEY: serverEnv.STRIPE_SECRET_KEY ?? "",
      STRIPE_WEBHOOK_SECRET: serverEnv.STRIPE_WEBHOOK_SECRET ?? "",
      PRICE_PLUS: serverEnv.PRICE_PLUS ?? "",
      PRICE_PRO: serverEnv.PRICE_PRO ?? "",
      STRIPE_CUSTOMER_PORTAL_RETURN_URL: serverEnv.STRIPE_CUSTOMER_PORTAL_RETURN_URL ?? "",
      STRIPE_CHECKOUT_SUCCESS_URL: serverEnv.STRIPE_CHECKOUT_SUCCESS_URL ?? "",
      STRIPE_CHECKOUT_CANCEL_URL: serverEnv.STRIPE_CHECKOUT_CANCEL_URL ?? "",
    };
  }
  return {
    SUPABASE_URL: serverEnv.SUPABASE_URL || publicEnv.NEXT_PUBLIC_SUPABASE_URL!,
    NEXT_PUBLIC_SUPABASE_URL: publicEnv.NEXT_PUBLIC_SUPABASE_URL!,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    SUPABASE_SERVICE_ROLE_KEY: serverEnv.SUPABASE_SERVICE_ROLE_KEY!,
    RESEND_API_KEY: serverEnv.RESEND_API_KEY!,
    RESEND_FROM_EMAIL: serverEnv.RESEND_FROM_EMAIL!,
    NEXT_PUBLIC_SITE_URL: serverEnv.NEXT_PUBLIC_SITE_URL!,
    STRIPE_SECRET_KEY: serverEnv.STRIPE_SECRET_KEY ?? "",
    STRIPE_WEBHOOK_SECRET: serverEnv.STRIPE_WEBHOOK_SECRET ?? "",
    PRICE_PLUS: serverEnv.PRICE_PLUS ?? "",
    PRICE_PRO: serverEnv.PRICE_PRO ?? "",
    STRIPE_CUSTOMER_PORTAL_RETURN_URL: serverEnv.STRIPE_CUSTOMER_PORTAL_RETURN_URL ?? "",
    STRIPE_CHECKOUT_SUCCESS_URL: serverEnv.STRIPE_CHECKOUT_SUCCESS_URL ?? "",
    STRIPE_CHECKOUT_CANCEL_URL: serverEnv.STRIPE_CHECKOUT_CANCEL_URL ?? "",
  };
}

export function getPublicEnv() {
  assertPublicEnv();
  const publicEnv = readPublicEnvVars();
  return {
    NEXT_PUBLIC_SUPABASE_URL: publicEnv.NEXT_PUBLIC_SUPABASE_URL!,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  };
}

// ─────────────────────────────────────────────────────────────
// Optional: Redis (for BullMQ import queue)
// ─────────────────────────────────────────────────────────────

export function getRedisUrl(): string | undefined {
  const value = process.env.REDIS_URL;
  if (!value || value.trim() === "") return undefined;
  return value;
}

export type RedisConnectionOptions = {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db?: number;
  tls?: Record<string, never>;
};

export type RedisClientOptions = RedisConnectionOptions & {
  lazyConnect?: boolean;
  maxRetriesPerRequest?: number | null;
  connectTimeout?: number;
  enableReadyCheck?: boolean;
  keepAlive?: number;
  retryStrategy?: (times: number) => number | null;
};

const DEFAULT_REDIS_CONNECT_TIMEOUT_MS = 5_000;
const DEFAULT_REDIS_MAX_RETRIES = 3;
const DEFAULT_REDIS_KEEP_ALIVE_MS = 10_000;

function readRedisPositiveIntEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function parseRedisDb(pathname: string): number | undefined {
  if (!pathname || pathname === "/") return undefined;
  const normalized = pathname.startsWith("/") ? pathname.slice(1) : pathname;
  if (!normalized) return undefined;

  const parsed = Number(normalized);
  if (!Number.isInteger(parsed) || parsed < 0) return undefined;
  return parsed;
}

function buildRedisRetryStrategy(maxAttempts: number) {
  return (times: number): number | null => {
    if (times > maxAttempts) return null;
    return Math.min(times * 200, 3_000) + Math.random() * 100;
  };
}

/** Returns Redis connection options for BullMQ; undefined if Redis not configured. */
export function getRedisConnectionOptions(): RedisConnectionOptions | undefined {
  const url = getRedisUrl();
  if (!url) return undefined;
  try {
    const u = new URL(url);
    if (u.protocol !== "redis:" && u.protocol !== "rediss:") {
      return undefined;
    }

    const port = u.port ? parseInt(u.port, 10) : 6379;
    if (!Number.isFinite(port) || port <= 0) return undefined;

    const username = u.username ? decodeURIComponent(u.username) : undefined;
    const password = u.password ? decodeURIComponent(u.password) : undefined;
    const db = parseRedisDb(u.pathname);

    return {
      host: u.hostname,
      port,
      username,
      password,
      ...(db !== undefined ? { db } : {}),
      ...(u.protocol === "rediss:" ? { tls: {} } : {}),
    };
  } catch {
    return undefined;
  }
}

export function getRedisClientOptions(
  overrides: Partial<RedisClientOptions> = {}
): RedisClientOptions | undefined {
  const connection = getRedisConnectionOptions();
  if (!connection) return undefined;

  const connectTimeout =
    overrides.connectTimeout ??
    readRedisPositiveIntEnv("REDIS_CONNECT_TIMEOUT_MS", DEFAULT_REDIS_CONNECT_TIMEOUT_MS);
  const maxRetriesPerRequest =
    overrides.maxRetriesPerRequest ??
    readRedisPositiveIntEnv("REDIS_MAX_RETRIES", DEFAULT_REDIS_MAX_RETRIES);

  return {
    ...connection,
    connectTimeout,
    maxRetriesPerRequest,
    enableReadyCheck: overrides.enableReadyCheck ?? true,
    keepAlive: overrides.keepAlive ?? DEFAULT_REDIS_KEEP_ALIVE_MS,
    retryStrategy:
      overrides.retryStrategy ??
      buildRedisRetryStrategy(
        Math.max(
          typeof maxRetriesPerRequest === "number"
            ? maxRetriesPerRequest
            : DEFAULT_REDIS_MAX_RETRIES,
          1
        ) * 3
      ),
    ...(overrides.lazyConnect !== undefined ? { lazyConnect: overrides.lazyConnect } : {}),
  };
}
