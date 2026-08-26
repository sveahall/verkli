import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
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
      ELEVENLABS_API_KEY: "sk-eleven-test",
      ELEVENLABS_VOICE_ID: "voice-abc",
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

  it("rejects a *.vercel.app site URL — it strands buyers after payment", () => {
    const env = goodEnv();
    env.NEXT_PUBLIC_SITE_URL = "https://verkli-abc123.vercel.app";
    expect(errors(env).map((p) => p.key)).toContain("NEXT_PUBLIC_SITE_URL");
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

  it("has no undecided flags left — every value is a recorded decision", () => {
    // AI chat was the last one; confirmed ON 2026-08-26. If this starts
    // failing, someone added a flag with needsConfirmation and the launch
    // build needs that decision before it ships.
    const warnings = verifyLaunchConfig(goodEnv()).filter((p) => p.severity === "warning");
    expect(warnings).toEqual([]);
  });
});
