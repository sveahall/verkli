import { createClient } from "@supabase/supabase-js";
<<<<<<< HEAD
import { assertServerEnv, getServerEnv } from "@/lib/env";
=======
>>>>>>> main

/**
 * Server-only Supabase client with service role.
 * Bypasses RLS. Never expose this key to the client.
 */
export function createAdminClient() {
<<<<<<< HEAD
  assertServerEnv();
  const env = getServerEnv();
  
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
=======
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, serviceRoleKey, {
>>>>>>> main
    auth: { persistSession: false },
  });
}
