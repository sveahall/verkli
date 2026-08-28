import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  ALL_LAUNCH_SPECS,
  LAUNCH_FLAGS,
  LAUNCH_GATES,
  verifyLaunchConfig,
} from "./launch-config";

/**
 * Reads the env vars that `flags.ts` actually consults, straight from source.
 * Parsing the file rather than importing it is the point: an import only sees
 * the flags someone remembered to export, while the source sees every
 * `process.env` read — including one added in a hurry the day before launch.
 */
function flagEnvKeysInSource(): string[] {
  const source = readFileSync(
    path.join(__dirname, "flags.ts"),
    "utf8"
  );
  const keys = new Set<string>();
  for (const match of source.matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
    keys.add(match[1]);
  }
  return [...keys].sort();
}

/** Every server-only twin declared in the matrix. */
function declaredTwins(): Set<string> {
  return new Set(
    ALL_LAUNCH_SPECS.map((s) => s.serverTwin).filter((k): k is string => Boolean(k))
  );
}

/**
 * Drift guard for the push script's copy list.
 *
 * That list is hand-maintained, and a hand-maintained list of secrets is a list
 * that silently goes stale. It did: `lib/nvidia-sd3.ts` reads
 * NVIDIA_SD3_API_KEY while only NVIDIA_NIM_API_KEY was being copied, so cover
 * generation failed in the deployed preview with a generic "Could not generate
 * cover options" — no missing-variable error anywhere, because the code treats
 * an absent key as a provider failure.
 *
 * This fails when the app reads a credential-shaped variable that the push
 * script neither copies nor explicitly declines to manage.
 */
describe("every credential the code reads is classified", () => {
  const CREDENTIAL_PREFIXES = /^(ELEVENLABS|NVIDIA|ANTHROPIC|HF|STRIPE|RESEND|SUPABASE|OPENAI)_/;

  /** Read by the code but deliberately not pushed, with the reason. */
  const NOT_PUSHED: Record<string, string> = {
    ELEVENLABS_API_TIMEOUT_MS: "tuning knob with a code default",
    STRIPE_CONNECT_DEFAULT_COUNTRY: "Stripe Connect is cut from September (plan §3)",
    STRIPE_CUSTOMER_PORTAL_RETURN_BASE: "superseded by STRIPE_CUSTOMER_PORTAL_RETURN_URL",
    SUPABASE_JWT_SECRET: "not read by the deployed app",
  };

  it("is either copied by push-launch-env or listed as deliberately skipped", () => {
    const srcDir = path.join(__dirname, "..");
    const script = readFileSync(
      path.join(__dirname, "../../scripts/push-launch-env.ts"),
      "utf8"
    );

    const found = new Set<string>();
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }
        if (!/\.tsx?$/.test(entry.name) || entry.name.includes(".test.")) continue;
        for (const m of readFileSync(full, "utf8").matchAll(/process\.env\.([A-Z][A-Z0-9_]{2,})/g)) {
          if (CREDENTIAL_PREFIXES.test(m[1])) found.add(m[1]);
        }
      }
    };
    walk(srcDir);

    const unclassified = [...found]
      .filter((key) => !key.startsWith("NEXT_PUBLIC_"))
      .filter((key) => !script.includes(`"${key}"`))
      .filter((key) => !(key in NOT_PUSHED))
      .sort();

    expect(unclassified).toEqual([]);
  });
});

describe("launch flag matrix", () => {
  const specKeys = new Set(ALL_LAUNCH_SPECS.map((s) => s.key));

  it("covers every flag env var that flags.ts reads", () => {
    const sourceKeys = flagEnvKeysInSource();
    const twins = declaredTwins();

    const uncovered = sourceKeys.filter(
      (key) => !specKeys.has(key) && !twins.has(key)
    );

    // A new flag with no launch decision is exactly the gap WP-05 closes.
    // If this fails, add the flag to LAUNCH_FLAGS with a reason — do not
    // widen the filter.
    expect(uncovered).toEqual([]);
  });

  it("has no entry for a flag flags.ts no longer reads", () => {
    const sourceKeys = new Set(flagEnvKeysInSource());
    const stale = LAUNCH_FLAGS.map((s) => s.key).filter((k) => !sourceKeys.has(k));
    expect(stale).toEqual([]);
  });

  it("gives every entry a non-empty reason", () => {
    for (const spec of ALL_LAUNCH_SPECS) {
      expect(spec.reason.trim().length, `${spec.key} has no reason`).toBeGreaterThan(0);
    }
  });

  it("lists no key twice", () => {
    const keys = ALL_LAUNCH_SPECS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("keeps both access gates off — while either is on, nobody reaches the product", () => {
    for (const gate of LAUNCH_GATES) {
      expect(gate.value, `${gate.key} must be off at launch`).toBe("false");
    }
  });

  it("keeps the flags the launch plan §3 cuts from September off", () => {
    const cut = [
      "NEXT_PUBLIC_TRANSLATIONS_ENABLED",
      "NEXT_PUBLIC_MARKETING_ENABLED",
      "NEXT_PUBLIC_SOCIAL_ENABLED",
      "NEXT_PUBLIC_BOOK_CLUBS_ENABLED",
      "NEXT_PUBLIC_POLLS_ENABLED",
      "NEXT_PUBLIC_NEWSLETTERS_ENABLED",
      "NEXT_PUBLIC_DONATIONS_ENABLED",
    ];
    for (const key of cut) {
      const spec = LAUNCH_FLAGS.find((s) => s.key === key);
      expect(spec, `${key} missing from the matrix`).toBeDefined();
      expect(spec!.value, `${key} is cut by plan §3`).toBe("false");
    }
  });


  it("declares a serverTwin for every non-public fallback flags.ts reads", () => {
    const sourceKeys = flagEnvKeysInSource();
    const twins = declaredTwins();
    // A twin flags.ts consults but the matrix does not declare is a flag that
    // can be switched back on without the verifier noticing.
    const undeclared = sourceKeys.filter(
      (k) => !k.startsWith("NEXT_PUBLIC_") && !specKeys.has(k) && !twins.has(k)
    );
    expect(undeclared).toEqual([]);
  });

  it("declares no serverTwin that flags.ts does not actually read", () => {
    const sourceKeys = new Set(flagEnvKeysInSource());
    const stale = [...declaredTwins()].filter((k) => !sourceKeys.has(k));
    expect(stale).toEqual([]);
  });

  it("keeps the flags WP-05 requires on, on", () => {
    for (const key of [
      "NEXT_PUBLIC_AUDIOBOOK_ENABLED",
      "NEXT_PUBLIC_DISCOVERY_ENABLED",
    ]) {
      expect(LAUNCH_FLAGS.find((s) => s.key === key)?.value).toBe("true");
    }
  });
});

describe("verifyLaunchConfig", () => {
  /** A minimal environment that satisfies the matrix. */
  function goodEnv(): Record<string, string | undefined> {
    return {
      NEXT_PUBLIC_AUDIOBOOK_ENABLED: "true",
      NEXT_PUBLIC_DISCOVERY_ENABLED: "true",
      NEXT_PUBLIC_AI_CHAT_ENABLED: "true",
      NEXT_PUBLIC_SITE_URL: "https://verkli.com",
      NEXT_PUBLIC_SUPABASE_URL: "https://p.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      SUPABASE_URL: "https://p.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-key",
      RESEND_API_KEY: "re_test",
      RESEND_FROM_EMAIL: "no-reply@verkli.com",
      STRIPE_SECRET_KEY: "sk_test_x",
      STRIPE_WEBHOOK_SECRET: "whsec_x",
      STRIPE_CHECKOUT_SUCCESS_URL: "https://verkli.com/account/billing",
      STRIPE_CHECKOUT_CANCEL_URL: "https://verkli.com/pricing",
      REDIS_URL: "rediss://user:pass@eu1.upstash.io:6379",
      FAL_KEY: "fal-test-key",
      ELEVENLABS_API_KEY: "sk-eleven-test",
      ELEVENLABS_VOICE_ID: "voice-abc",
      ANTHROPIC_API_KEY: "sk-ant-test",
    };
  }

  function errors(env: Record<string, string | undefined>) {
    return verifyLaunchConfig(env).filter((p) => p.severity === "error");
  }

  it("passes a correct launch environment", () => {
    expect(errors(goodEnv())).toEqual([]);
  });

  it("flags a required-on flag that is unset", () => {
    const env = goodEnv();
    delete env.NEXT_PUBLIC_AUDIOBOOK_ENABLED;
    expect(errors(env).map((p) => p.key)).toContain("NEXT_PUBLIC_AUDIOBOOK_ENABLED");
  });

  it('accepts "1" for a required-on flag, because parseBool does', () => {
    const env = goodEnv();
    env.NEXT_PUBLIC_DISCOVERY_ENABLED = "1";
    expect(errors(env)).toEqual([]);
  });

  it('rejects "false" on a required-on flag', () => {
    const env = goodEnv();
    env.NEXT_PUBLIC_AUDIOBOOK_ENABLED = "false";
    expect(errors(env).map((p) => p.key)).toContain("NEXT_PUBLIC_AUDIOBOOK_ENABLED");
  });

  it("rejects a required-on flag satisfied only by its server twin", () => {
    const env = goodEnv();
    delete env.NEXT_PUBLIC_AUDIOBOOK_ENABLED;
    env.AUDIOBOOK_ENABLED = "true";
    // getAudiobookEnabled() reads only the NEXT_PUBLIC_ form, so the audiobook
    // UI would be hidden in a build the server considers audiobook-enabled.
    expect(errors(env).map((p) => p.key)).toContain("NEXT_PUBLIC_AUDIOBOOK_ENABLED");
  });

  it('rejects a required-on flag with trailing whitespace — parseBool does not trim', () => {
    const env = goodEnv();
    env.NEXT_PUBLIC_AUDIOBOOK_ENABLED = "true ";
    expect(errors(env).map((p) => p.key)).toContain("NEXT_PUBLIC_AUDIOBOOK_ENABLED");
  });

  it('treats " true" on a must-be-off flag as off, matching parseBool', () => {
    const env = goodEnv();
    env.NEXT_PUBLIC_POLLS_ENABLED = " true";
    expect(errors(env)).toEqual([]);
  });

  it("catches a waitlist gate left on, which would redirect every path to /waitlist", () => {
    const env = goodEnv();
    env.NEXT_PUBLIC_WAITLIST_ONLY = "true";
    expect(errors(env).map((p) => p.key)).toContain("NEXT_PUBLIC_WAITLIST_ONLY");
  });

  it("catches the demo façade left on for a public build", () => {
    const env = goodEnv();
    env.NEXT_PUBLIC_DEMO_FACADE_ENABLED = "true";
    expect(errors(env).map((p) => p.key)).toContain("NEXT_PUBLIC_DEMO_FACADE_ENABLED");
  });

  it('treats "1" as on for a must-be-off flag, since parseBool does', () => {
    const env = goodEnv();
    env.NEXT_PUBLIC_MARKETING_ENABLED = "1";
    expect(errors(env).map((p) => p.key)).toContain("NEXT_PUBLIC_MARKETING_ENABLED");
  });

  it("accepts an unset must-be-off flag — unset is the documented default", () => {
    const env = goodEnv();
    expect(env.NEXT_PUBLIC_POLLS_ENABLED).toBeUndefined();
    expect(errors(env).map((p) => p.key)).not.toContain("NEXT_PUBLIC_POLLS_ENABLED");
  });

  it("flags a missing NEXT_PUBLIC_SITE_URL", () => {
    const env = goodEnv();
    delete env.NEXT_PUBLIC_SITE_URL;
    expect(errors(env).map((p) => p.key)).toContain("NEXT_PUBLIC_SITE_URL");
  });

  it("flags a missing ElevenLabs key, because audiobook ships on", () => {
    const env = goodEnv();
    delete env.ELEVENLABS_API_KEY;
    expect(errors(env).map((p) => p.key)).toContain("ELEVENLABS_API_KEY");
  });

  it("catches a server-only twin that turns a launch-cut feature back on", () => {
    const env = goodEnv();
    // Public flag stays unset, so a naive check reads the feature as off —
    // but isMarketingEnabled() falls through to this and returns true.
    env.MARKETING_ENABLED = "true";
    expect(errors(env).map((p) => p.key)).toContain("MARKETING_ENABLED");
  });

  it("ignores the twin when the public flag is explicitly off — flags.ts resolves with ??", () => {
    const env = goodEnv();
    env.NEXT_PUBLIC_MARKETING_ENABLED = "false";
    env.MARKETING_ENABLED = "true";
    // The public value is non-nullish, so `??` never reaches the twin and
    // marketing really is off. Flagging it would reject a valid deployment.
    expect(errors(env)).toEqual([]);
  });

  it("ignores the twin when the public flag is an empty string, which is also non-nullish", () => {
    const env = goodEnv();
    env.NEXT_PUBLIC_MARKETING_ENABLED = "";
    env.MARKETING_ENABLED = "true";
    expect(errors(env)).toEqual([]);
  });

  it('catches "TRUE" on a must-be-off flag, because parseBool lowercases', () => {
    const env = goodEnv();
    env.NEXT_PUBLIC_POLLS_ENABLED = "TRUE";
    expect(errors(env).map((p) => p.key)).toContain("NEXT_PUBLIC_POLLS_ENABLED");
  });

  it("rejects a *.vercel.app site URL in production — it strands buyers after payment", () => {
    const env = goodEnv();
    env.NEXT_PUBLIC_SITE_URL = "https://verkli-abc123.vercel.app";
    expect(errors(env).map((p) => p.key)).toContain("NEXT_PUBLIC_SITE_URL");
  });

  it("accepts a *.vercel.app site URL on preview, where it is the point", () => {
    // request-url.ts rejects .vercel.app and falls back to the request host.
    // On a preview that host IS the preview, so redirects land back where the
    // tester is. Setting the real domain would bounce them onto production.
    const env = goodEnv();
    env.NEXT_PUBLIC_SITE_URL = "https://verkli-web.vercel.app";
    const preview = verifyLaunchConfig(env, "preview").filter((p) => p.severity === "error");
    expect(preview).toEqual([]);
  });

  it("still rejects localhost on preview", () => {
    const env = goodEnv();
    env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
    const preview = verifyLaunchConfig(env, "preview").filter((p) => p.severity === "error");
    expect(preview.map((p) => p.key)).toContain("NEXT_PUBLIC_SITE_URL");
  });

  it("rejects a localhost site URL", () => {
    const env = goodEnv();
    env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
    expect(errors(env).map((p) => p.key)).toContain("NEXT_PUBLIC_SITE_URL");
  });

  it("rejects a site URL with a path — redirects are built by concatenation", () => {
    const env = goodEnv();
    env.NEXT_PUBLIC_SITE_URL = "https://verkli.com/app";
    expect(errors(env).map((p) => p.key)).toContain("NEXT_PUBLIC_SITE_URL");
  });

  it("rejects a site URL carrying a query string", () => {
    const env = goodEnv();
    env.NEXT_PUBLIC_SITE_URL = "https://verkli.com?utm=x";
    expect(errors(env).map((p) => p.key)).toContain("NEXT_PUBLIC_SITE_URL");
  });

  it("accepts one trailing slash — request-url.ts strips it", () => {
    const env = goodEnv();
    env.NEXT_PUBLIC_SITE_URL = "https://verkli.com/";
    expect(errors(env)).toEqual([]);
  });

  it("rejects an unparseable site URL", () => {
    const env = goodEnv();
    env.NEXT_PUBLIC_SITE_URL = "verkli.com";
    expect(errors(env).map((p) => p.key)).toContain("NEXT_PUBLIC_SITE_URL");
  });

  it("flags a missing narrator voice even when the ElevenLabs key is set", () => {
    const env = goodEnv();
    delete env.ELEVENLABS_VOICE_ID;
    expect(errors(env).map((p) => p.key)).toContain("ELEVENLABS_VOICE_ID or TTS_VOICE_ID");
  });

  it("accepts TTS_VOICE_ID as the narrator voice", () => {
    const env = goodEnv();
    delete env.ELEVENLABS_VOICE_ID;
    env.TTS_VOICE_ID = "voice-xyz";
    expect(errors(env)).toEqual([]);
  });

  it("rejects a localhost Stripe redirect — a paid customer would land nowhere", () => {
    const env = goodEnv();
    env.STRIPE_CHECKOUT_SUCCESS_URL = "http://localhost:3000/account/billing";
    expect(errors(env).map((p) => p.key)).toContain("STRIPE_CHECKOUT_SUCCESS_URL");
  });

  it("rejects an http Stripe redirect", () => {
    const env = goodEnv();
    env.STRIPE_CHECKOUT_CANCEL_URL = "http://verkli.com/pricing";
    expect(errors(env).map((p) => p.key)).toContain("STRIPE_CHECKOUT_CANCEL_URL");
  });

  it("allows a path on a Stripe redirect, unlike the site URL", () => {
    const env = goodEnv();
    env.STRIPE_CHECKOUT_SUCCESS_URL = "https://verkli.com/account/billing?x=1";
    expect(errors(env)).toEqual([]);
  });

  it("rejects an environment with no AI provider while AI chat is on", () => {
    // The flag on with neither key means the route serves canned template
    // replies. A feature switched on and quietly nonfunctional is worse than
    // one switched off, and a green check would certify exactly that.
    const env = goodEnv();
    delete env.ANTHROPIC_API_KEY;
    expect(errors(env).map((p) => p.key)).toContain(
      "ANTHROPIC_API_KEY or NVIDIA_NIM_API_KEY"
    );
  });

  it("accepts NVIDIA NIM alone as the AI provider", () => {
    const env = goodEnv();
    delete env.ANTHROPIC_API_KEY;
    env.NVIDIA_NIM_API_KEY = "nim-test";
    expect(errors(env)).toEqual([]);
  });

  for (const key of [
    "SUPABASE_SERVICE_ROLE_KEY",
    "RESEND_API_KEY",
    "RESEND_FROM_EMAIL",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_CHECKOUT_SUCCESS_URL",
    "STRIPE_CHECKOUT_CANCEL_URL",
    "REDIS_URL",
    "FAL_KEY",
  ]) {
    it(`rejects a launch environment missing ${key}`, () => {
      const env = goodEnv();
      delete env[key];
      expect(errors(env).map((p) => p.key)).toContain(key);
    });
  }

  it('treats BETA_LOCK="1" as off, because middleware compares the literal "true"', () => {
    const env = goodEnv();
    env.BETA_LOCK = "1";
    // parseBool would say true; middleware would not. Rejecting this would
    // block a deployment whose gate is actually open.
    expect(errors(env)).toEqual([]);
  });

  it('warns on BETA_LOCK="1" so the misleading value still gets noticed', () => {
    const env = goodEnv();
    env.BETA_LOCK = "1";
    const warnings = verifyLaunchConfig(env).filter((p) => p.severity === "warning");
    expect(warnings.map((w) => w.key)).toContain("BETA_LOCK");
  });

  it('still rejects a literal "true" on an access gate', () => {
    const env = goodEnv();
    env.BETA_LOCK = "true";
    expect(errors(env).map((p) => p.key)).toContain("BETA_LOCK");
  });

  it("has no undecided flags left — every value is a recorded decision", () => {
    // AI chat was the last one; confirmed ON 2026-08-26. If this starts
    // failing, someone added a flag with needsConfirmation and the launch
    // build needs that decision before it ships.
    const warnings = verifyLaunchConfig(goodEnv()).filter((p) => p.severity === "warning");
    expect(warnings).toEqual([]);
  });
});
