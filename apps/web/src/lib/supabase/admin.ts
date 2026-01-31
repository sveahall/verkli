import { createClient } from "@supabase/supabase-js";
import { assertServerEnv, getServerEnv } from "@/lib/env";

/**
 * Server-only Supabase client with service role.
 * Bypasses RLS. Never expose this key to the client.
 */
export function createAdminClient() {
  assertServerEnv();
  const env = getServerEnv();
  
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}
