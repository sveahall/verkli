/**
 * Unit tests for the server-side demo guard.
 *
 * The guard's contract is small enough that we can exercise the whole
 * surface — flag-off / no-profile / demo-on / DB-error / response shape —
 * with a minimal SupabaseClient stub. No network, no real DB.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEMO_STRIPPED_BODY, evaluateDemoGuard } from "./demo-guard";

interface ProfileRow {
  demo_mode?: boolean | null;
}

function buildSupabaseStub(opts: {
  profile?: ProfileRow | null;
  error?: { message: string } | null;
}): SupabaseClient {
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => ({
      data: opts.profile ?? null,
      error: opts.error ?? null,
    }),
  };
  return {
    from: () => builder,
  } as unknown as SupabaseClient;
}

const FLAG_KEY = "NEXT_PUBLIC_DEMO_FACADE_ENABLED";
const ALT_FLAG_KEY = "DEMO_FACADE_ENABLED";

describe("evaluateDemoGuard", () => {
  const originalFlag = process.env[FLAG_KEY];
  const originalAlt = process.env[ALT_FLAG_KEY];

  afterEach(() => {
    if (originalFlag === undefined) delete process.env[FLAG_KEY];
    else process.env[FLAG_KEY] = originalFlag;
    if (originalAlt === undefined) delete process.env[ALT_FLAG_KEY];
    else process.env[ALT_FLAG_KEY] = originalAlt;
  });

  describe("when the deployment flag is off", () => {
    beforeEach(() => {
      delete process.env[FLAG_KEY];
      delete process.env[ALT_FLAG_KEY];
    });

    it("returns shouldSkip=false even if the profile is flagged demo_mode", async () => {
      const supabase = buildSupabaseStub({ profile: { demo_mode: true } });
      const result = await evaluateDemoGuard(supabase, "user-1", "test/route");
      expect(result.shouldSkip).toBe(false);
      expect(result.response).toBeUndefined();
    });

    it("does not call the supabase factory when the flag is off", async () => {
      let factoryCalls = 0;
      const factory = async (): Promise<SupabaseClient> => {
        factoryCalls++;
        return buildSupabaseStub({ profile: { demo_mode: true } });
      };
      const result = await evaluateDemoGuard(factory, "user-1", "test/route");
      expect(result.shouldSkip).toBe(false);
      expect(factoryCalls).toBe(0); // saves a createClient() round-trip
    });
  });

  describe("when the deployment flag is on", () => {
    beforeEach(() => {
      process.env[FLAG_KEY] = "true";
    });

    it("returns shouldSkip=true with the contractual JSON body when profile.demo_mode is true", async () => {
      const supabase = buildSupabaseStub({ profile: { demo_mode: true } });
      const result = await evaluateDemoGuard(supabase, "user-1", "audiobook/generate");
      expect(result.shouldSkip).toBe(true);
      expect(result.response).toBeDefined();
      const body = await result.response!.json();
      expect(body).toEqual(DEMO_STRIPPED_BODY);
      expect(result.response!.status).toBe(200);
    });

    it("returns shouldSkip=false when the profile is not flagged demo_mode", async () => {
      const supabase = buildSupabaseStub({ profile: { demo_mode: false } });
      const result = await evaluateDemoGuard(supabase, "user-1", "test/route");
      expect(result.shouldSkip).toBe(false);
    });

    it("fails open when the profile lookup errors — better one charged job than a wrong-account 200", async () => {
      const supabase = buildSupabaseStub({
        profile: null,
        error: { message: "connection reset" },
      });
      const result = await evaluateDemoGuard(supabase, "user-1", "test/route");
      expect(result.shouldSkip).toBe(false);
    });

    it("treats null/undefined profile as 'not demo'", async () => {
      const supabase = buildSupabaseStub({ profile: null });
      const result = await evaluateDemoGuard(supabase, "user-1", "test/route");
      expect(result.shouldSkip).toBe(false);
    });
  });
});
