/**
 * Environment variable validation for worker processes.
 * Used by start-workers.ts and can be used by Docker entrypoints.
 * Does not replace assertServerEnv() inside individual workers.
 */

import { getRedisConnectionOptions } from "../src/lib/env";

export function validateWorkerEnv(): void {
  const missing: string[] = [];

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    missing.push("SUPABASE_SERVICE_ROLE_KEY");
  }

  const hasSupabaseUrl =
    (process.env.SUPABASE_URL?.trim() ?? "") !== "" ||
    (process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "") !== "";
  if (!hasSupabaseUrl) {
    missing.push("SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL");
  }

  const redis = getRedisConnectionOptions();
  if (!redis) {
    missing.push("REDIS_URL (valid Redis URL)");
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required worker environment variables: ${missing.join(", ")}. ` +
        "Set REDIS_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL."
    );
  }
}
