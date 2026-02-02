/**
 * Environment variable validation
 * 
 * This module ensures required env variables are present before runtime.
 * Call assertServerEnv() in API routes and server-only code.
 * Call assertPublicEnv() in both client and server code.
 */

// ─────────────────────────────────────────────────────────────
// Public env variables (available in client and server)
// ─────────────────────────────────────────────────────────────

const PUBLIC_ENV_VARS = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
} as const;

export function assertPublicEnv(): void {
  const missing: string[] = [];

  if (!PUBLIC_ENV_VARS.NEXT_PUBLIC_SUPABASE_URL) {
    missing.push('NEXT_PUBLIC_SUPABASE_URL');
  }
  if (!PUBLIC_ENV_VARS.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required public environment variables: ${missing.join(', ')}\n` +
      `Please set these in your .env.local file.`
    );
  }
}

// ─────────────────────────────────────────────────────────────
// Server-only env variables (never exposed to client)
// ─────────────────────────────────────────────────────────────

const SERVER_ENV_VARS = {
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
} as const;

export function assertServerEnv(): void {
  // Also check public env vars
  assertPublicEnv();

  const missing: string[] = [];

  if (!SERVER_ENV_VARS.SUPABASE_SERVICE_ROLE_KEY) {
    missing.push('SUPABASE_SERVICE_ROLE_KEY');
  }
  if (!SERVER_ENV_VARS.RESEND_API_KEY) {
    missing.push('RESEND_API_KEY');
  }
  if (!SERVER_ENV_VARS.RESEND_FROM_EMAIL) {
    missing.push('RESEND_FROM_EMAIL');
  }
  if (!SERVER_ENV_VARS.NEXT_PUBLIC_SITE_URL) {
    missing.push('NEXT_PUBLIC_SITE_URL');
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required server environment variables: ${missing.join(', ')}\n` +
      `Please set these in your .env.local file.\n` +
      `NOTE: These are server-only variables and should NEVER be exposed to the client.`
    );
  }
}

// ─────────────────────────────────────────────────────────────
// Optional: Get validated env with type safety
// ─────────────────────────────────────────────────────────────

export function getServerEnv() {
  assertServerEnv();
  return {
    NEXT_PUBLIC_SUPABASE_URL: PUBLIC_ENV_VARS.NEXT_PUBLIC_SUPABASE_URL!,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: PUBLIC_ENV_VARS.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    SUPABASE_SERVICE_ROLE_KEY: SERVER_ENV_VARS.SUPABASE_SERVICE_ROLE_KEY!,
    RESEND_API_KEY: SERVER_ENV_VARS.RESEND_API_KEY!,
    RESEND_FROM_EMAIL: SERVER_ENV_VARS.RESEND_FROM_EMAIL!,
    NEXT_PUBLIC_SITE_URL: SERVER_ENV_VARS.NEXT_PUBLIC_SITE_URL!,
  };
}

export function getPublicEnv() {
  assertPublicEnv();
  return {
    NEXT_PUBLIC_SUPABASE_URL: PUBLIC_ENV_VARS.NEXT_PUBLIC_SUPABASE_URL!,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: PUBLIC_ENV_VARS.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  };
}

// ─────────────────────────────────────────────────────────────
// Optional: Redis (for BullMQ import queue)
// ─────────────────────────────────────────────────────────────

export function getRedisUrl(): string | undefined {
  return process.env.REDIS_URL ?? undefined;
}

/** Returns Redis connection options for BullMQ; undefined if Redis not configured. */
export function getRedisConnectionOptions():
  | { host: string; port: number; password?: string }
  | undefined {
  const url = getRedisUrl();
  if (!url || url.trim() === "") return undefined;
  try {
    const u = new URL(url);
    return {
      host: u.hostname,
      port: u.port ? parseInt(u.port, 10) : 6379,
      password: u.password || undefined,
    };
  } catch {
    return undefined;
  }
}
