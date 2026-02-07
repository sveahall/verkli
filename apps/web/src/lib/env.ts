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
      NEXT_PUBLIC_SUPABASE_URL: url!,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
      SUPABASE_SERVICE_ROLE_KEY: serverEnv.SUPABASE_SERVICE_ROLE_KEY!,
      RESEND_API_KEY: serverEnv.RESEND_API_KEY ?? "",
      RESEND_FROM_EMAIL: serverEnv.RESEND_FROM_EMAIL ?? "",
      NEXT_PUBLIC_SITE_URL: serverEnv.NEXT_PUBLIC_SITE_URL ?? "",
    };
  }
  return {
    NEXT_PUBLIC_SUPABASE_URL: publicEnv.NEXT_PUBLIC_SUPABASE_URL!,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    SUPABASE_SERVICE_ROLE_KEY: serverEnv.SUPABASE_SERVICE_ROLE_KEY!,
    RESEND_API_KEY: serverEnv.RESEND_API_KEY!,
    RESEND_FROM_EMAIL: serverEnv.RESEND_FROM_EMAIL!,
    NEXT_PUBLIC_SITE_URL: serverEnv.NEXT_PUBLIC_SITE_URL!,
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

/** Returns Redis connection options for BullMQ; undefined if Redis not configured. */
export function getRedisConnectionOptions():
  | { host: string; port: number; password?: string }
  | undefined {
  const url = getRedisUrl();
  if (!url) return undefined;
  try {
    const u = new URL(url);
    const port = u.port ? parseInt(u.port, 10) : 6379;
    if (!Number.isFinite(port) || port <= 0) return undefined;
    return {
      host: u.hostname,
      port,
      password: u.password || undefined,
    };
  } catch {
    return undefined;
  }
}
