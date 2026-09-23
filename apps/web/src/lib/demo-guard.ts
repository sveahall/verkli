import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isDemoFacadeEnabled } from "./flags";

/**
 * Server-side guard that short-circuits real worker / API calls when the
 * signed-in user is the investor-pitch demo account AND the demo façade
 * flag is on for the deployment.
 *
 * Why a server-side guard instead of just hiding the buttons in the demo
 * UI: a stray useEffect or SWR revalidate can quietly fire one of the
 * generate-/build- endpoints, queueing real work and burning real money
 * mid-pitch. The UI gate alone is not safe.
 *
 * Apply to every endpoint that triggers a worker or an external paid
 * service (audiobook generate / preview, translation start, trailer
 * build, marketing video generate, etc). Cover generation is exempted —
 * the live cover-gen path is the visual moment that makes the demo feel
 * real, so we keep it running and instead bypass the rate limit for the
 * demo user (see lib/rate-limit usage in cover/generate/route.ts).
 */

export interface DemoGuardResult {
  /** True iff the call should be skipped — the UI handles the cached response. */
  shouldSkip: boolean;
  /**
   * Pre-built JSON response the route should return when shouldSkip is
   * true. The shape is contractual — keep it stable across all guarded
   * routes so client code can branch on `demo_mode === true`.
   */
  response?: NextResponse;
}

const STRIPPED_RESPONSE_BODY = {
  ok: true as const,
  demo_mode: true as const,
  message: "Skipped — demo mode active. Façade serves cached response.",
};

/**
 * Look up profiles.demo_mode for the given user_id and decide whether the
 * call should be stripped. Returns shouldSkip=false on any DB error so we
 * fail-open into the real path (better to charge a tiny audiobook job
 * than to silently 200 the wrong account).
 *
 * Accepts either a ready-made SupabaseClient or a lazy factory. The factory
 * shape lets the deployment-flag check run first; if the flag is off we
 * never instantiate a client, which keeps unit tests that don't mock
 * @/lib/supabase/server from failing on `cookies()` outside a request scope.
 */
export async function evaluateDemoGuard(
  supabaseOrFactory: SupabaseClient | (() => Promise<SupabaseClient>),
  userId: string,
  routeLabel: string
): Promise<DemoGuardResult> {
  if (!isDemoFacadeEnabled()) {
    return { shouldSkip: false };
  }

  const supabase: SupabaseClient =
    typeof supabaseOrFactory === "function"
      ? await supabaseOrFactory()
      : supabaseOrFactory;

  const { data, error } = await supabase
    .from("profiles")
    .select("demo_mode")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.warn(
      `[demo-guard] profile lookup failed for ${routeLabel} (${userId}): ${error.message}`
    );
    return { shouldSkip: false };
  }

  const demoMode = Boolean(
    (data as { demo_mode?: boolean | null } | null)?.demo_mode
  );
  if (!demoMode) {
    return { shouldSkip: false };
  }

  console.info(
    `[demo-guard] stripped real call on ${routeLabel} for user ${userId} (demo_mode=true)`
  );
  return {
    shouldSkip: true,
    response: NextResponse.json(STRIPPED_RESPONSE_BODY, { status: 200 }),
  };
}

/** Exposed for testing the response shape without spinning a route. */
export const DEMO_STRIPPED_BODY = STRIPPED_RESPONSE_BODY;
