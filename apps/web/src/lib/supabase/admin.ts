import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { assertServerEnv, getServerEnv } from "@/lib/env";

/**
 * Server-only Supabase client with service role.
 * Bypasses RLS. Never expose this key to the client.
 *
 * Typed with `Database`. It was not, and that was the single largest reason
 * missing-column and missing-table bugs kept shipping: with an untyped client
 * `.from("anything")` and `.select("any, columns")` are both just strings, so
 * PostgREST rejected the request at runtime, the caller discarded the error,
 * and the feature was silently dead. `pod_orders` did not exist for six months
 * behind exactly this.
 */
export function createAdminClient() {
  assertServerEnv();
  const env = getServerEnv();
  
  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}
