/**
 * The launch flag matrix — one canonical place that says what every feature
 * flag must be for the September 20 soft-launch build.
 *
 * Why this file exists: `NEXT_PUBLIC_*` vars are baked into the bundle at
 * `next build`, so a flag cannot be flipped in production. Every flag decision
 * has to be made BEFORE the launch build, and getting one wrong means a
 * redeploy, not a config change. Prose in a header comment already drifted
 * from the plan once (it told deployers to enable translations and marketing,
 * both of which the launch plan cuts), so the matrix is data with a test
 * behind it rather than a comment.
 *
 * Sources of truth this encodes:
 *   - docs/plan/launch-plan-2026-09.md §3  — what ships in September
 *   - docs/plan/launch-plan-2026-09.md §5  — WP-05 acceptance criteria
 *
 * Adding a flag to `flags.ts` without adding it here fails
 * `launch-config.test.ts`. That is deliberate: a new flag with no launch
 * decision is exactly the gap this package closes.
 */

import { parseBool } from "./flags";

export type LaunchFlagValue = "true" | "false";

export type LaunchFlagSpec = {
  /** The env var read by `flags.ts` (or `middleware.ts`). */
  key: string;
  /**
   * The server-only fallback `flags.ts` consults when `key` is unset
   * (`isMarketingEnabled` reads NEXT_PUBLIC_MARKETING_ENABLED ?? MARKETING_ENABLED).
   * Must be verified too: setting only the twin turns a launch-cut feature back
   * on server-side while the public flag still reads as off.
   */
  serverTwin?: string;
  /** What the launch build must be built with. */
  value: LaunchFlagValue;
  /** Why — cite the decision, not the behaviour. */
  reason: string;
  /**
   * True when `middleware.ts` compares this variable against the literal
   * string "true" rather than running it through `parseBool`. For those, "1"
   * and "TRUE" are runtime-OFF, and reporting them as on would reject a
   * deployment that behaves correctly.
   */
  exactMatch?: boolean;
  /**
   * True when the value below is this package's recommendation rather than a
   * decision the launch plan actually made. The verifier warns on these so
   * they get confirmed instead of silently inherited.
   */
  needsConfirmation?: boolean;
};

/**
 * Feature flags, in the order they appear in `flags.ts`.
 *
 * Note on OFF entries: `flags.ts` defaults every flag to OFF when unset, so an
 * OFF entry does not have to be set in the deploy environment. It is listed
 * anyway — "we decided this is off" and "nobody thought about it" should not
 * look identical to whoever runs the deploy.
 */
export const LAUNCH_FLAGS: readonly LaunchFlagSpec[] = [
  {
    key: "NEXT_PUBLIC_AUDIOBOOK_ENABLED",
    serverTwin: "AUDIOBOOK_ENABLED",
    value: "true",
    reason:
      "Plan §3: production-plan §9 criterion 4 (Johan's audiobook plays stably) is a Must. Generation stays Pro/paid-gated, so ON does not open a cost tap.",
  },
  {
    key: "NEXT_PUBLIC_DISCOVERY_ENABLED",
    serverTwin: "DISCOVERY_ENABLED",
    value: "true",
    reason: "WP-05 acceptance criterion. /reader/discover and /reader/genres are part of the September surface.",
  },
  {
    key: "NEXT_PUBLIC_TRANSLATIONS_ENABLED",
    serverTwin: "TRANSLATIONS_ENABLED",
    value: "false",
    reason:
      "Plan §3 cuts translations from September. The flags.ts header used to say this must be true — that predates the launch plan.",
  },
  {
    key: "NEXT_PUBLIC_MARKETING_ENABLED",
    serverTwin: "MARKETING_ENABLED",
    value: "false",
    reason:
      "Plan §3 cuts the marketing engine. Costs nothing to cut: social OAuth has no Connect button, so the feature is unreachable anyway (§4b).",
  },
  {
    key: "NEXT_PUBLIC_SOCIAL_ENABLED",
    serverTwin: "SOCIAL_ENABLED",
    value: "false",
    reason: "Plan §3 cuts socials OAuth — platform review takes weeks.",
  },
  {
    key: "NEXT_PUBLIC_BOOK_CLUBS_ENABLED",
    serverTwin: "BOOK_CLUBS_ENABLED",
    value: "false",
    reason: "Plan §3 cuts book clubs.",
  },
  {
    key: "NEXT_PUBLIC_POLLS_ENABLED",
    serverTwin: "POLLS_ENABLED",
    value: "false",
    reason: "Plan §3 cuts polls.",
  },
  {
    key: "NEXT_PUBLIC_NEWSLETTERS_ENABLED",
    serverTwin: "NEWSLETTERS_ENABLED",
    value: "false",
    reason: "Plan §3 cuts newsletters.",
  },
  {
    key: "NEXT_PUBLIC_DONATIONS_ENABLED",
    serverTwin: "DONATIONS_ENABLED",
    value: "false",
    reason: "Plan §3 cuts donations.",
  },
  {
    key: "NEXT_PUBLIC_OFFLINE_READING_ENABLED",
    serverTwin: "OFFLINE_READING_ENABLED",
    value: "false",
    reason: "Not in plan §3's September surface. Unverified on the device matrix.",
  },
  {
    key: "NEXT_PUBLIC_RECOMMENDATIONS_ENABLED",
    value: "false",
    reason:
      "Not in plan §3's September surface. One book ships in September, so there is nothing to recommend against.",
  },
  {
    key: "NEXT_PUBLIC_FREEMIUM_GATE_ENABLED",
    serverTwin: "FREEMIUM_GATE_ENABLED",
    value: "false",
    reason: "D4 + D11: no quota gating during the cohort window.",
  },
  {
    key: "NEXT_PUBLIC_DEMO_FACADE_ENABLED",
    serverTwin: "DEMO_FACADE_ENABLED",
    value: "false",
    reason:
      "WP-05 acceptance criterion. The investor-pitch façade must not be reachable on the public launch build.",
  },
  {
    key: "NEXT_PUBLIC_SPRINT0_DEMO_BADGE_ENABLED",
    serverTwin: "SPRINT0_DEMO_BADGE_ENABLED",
    value: "false",
    reason: "Demo artifact. Nothing on a public build should be badged as a demo.",
  },
  {
    key: "NEXT_PUBLIC_AI_CHAT_ENABLED",
    serverTwin: "AI_CHAT_ENABLED",
    value: "true",
    reason:
      "ON at launch — confirmed by Svea 2026-08-26, the one flag the launch plan itself never decided. Author-only, behind requireAuthorRoleForApi and a 20/min per-user limit. Every request is a billable LLM call, so it is also the only flag that trades money for value; the rate limit is the ceiling.",
  },
] as const;

/**
 * Access gates. Not feature flags — these decide whether anyone can reach the
 * product at all, which is why getting them wrong is a launch-day outage
 * rather than a missing feature.
 */
export const LAUNCH_GATES: readonly LaunchFlagSpec[] = [
  {
    key: "NEXT_PUBLIC_WAITLIST_ONLY",
    exactMatch: true,
    value: "false",
    reason:
      "WP-05 acceptance criterion. While true, middleware.ts redirects every path to /waitlist.",
  },
  {
    key: "BETA_LOCK",
    exactMatch: true,
    value: "false",
    reason:
      "WP-05 acceptance criterion. While true, only /waitlist and /auth are reachable for non-beta users.",
  },
] as const;

/**
 * Env vars the launch build needs present, and how to judge them.
 *
 * `anyOf` exists because some settings are satisfied by more than one var:
 * the narrator voice is `ELEVENLABS_VOICE_ID` OR `TTS_VOICE_ID`, and checking
 * only one of them would pass an environment where audiobook still refuses
 * with AUDIOBOOK_VOICE_UNCONFIGURED.
 */
export type LaunchRequiredSpec = {
  /** Satisfied when at least one of these is non-empty. */
  anyOf: readonly string[];
  reason: string;
  /**
   * Optional value check on the var that was found. Returning a string makes
   * it an error with that message; null passes.
   */
  validate?: (value: string, target: VerifyTarget) => string | null;
};

/**
 * Rejects site URLs that parse but strand users.
 *
 * `request-url.ts` documents why: a `*.vercel.app` value once pointed at a
 * superseded deployment and Stripe redirected a buyer to a DEPLOYMENT_NOT_FOUND
 * 404 *after* a completed Apple Pay charge. request-url.ts now ignores such a
 * value at runtime and falls back to the request host — which means a wrong
 * NEXT_PUBLIC_SITE_URL fails silently rather than loudly. Catch it here instead.
 */
export type VerifyTarget = "production" | "preview";

export function validateSiteUrl(
  value: string,
  target: VerifyTarget = "production"
): string | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return `is ${JSON.stringify(value)}, which is not a parseable URL.`;
  }
  if (url.protocol !== "https:") {
    return `is ${JSON.stringify(value)}; the launch build must use https.`;
  }
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".local")) {
    return `is ${JSON.stringify(value)}, a local host. Receipts and Stripe redirects would point at the deployer's machine.`;
  }
  if (host.endsWith(".vercel.app")) {
    // Correct for a preview and wrong for production. request-url.ts rejects
    // .vercel.app and falls back to the host the request arrived on — on a
    // preview that is the preview's own URL, which is what you want, and in
    // production it is a silent fallback masking a misconfiguration.
    if (target === "production") {
      return `is a *.vercel.app alias. request-url.ts rejects these at runtime and silently falls back to the request host, so this would not do what it looks like it does. Use the real custom domain.`;
    }
  }
  // Must be a bare origin. Call sites build URLs by concatenation
  // (`${baseUrl}/reader/profile?credits=success`), and normalizeConfiguredUrl
  // strips only a trailing slash — not a path — so "https://verkli.com/app"
  // yields "https://verkli.com/app/reader/profile" and strands the buyer.
  // One trailing slash is fine; runtime removes it.
  if (url.pathname !== "/" && url.pathname !== "") {
    return `is ${JSON.stringify(value)}; it must be a bare origin with no path. Redirect URLs are built by concatenation, so a path here produces ${JSON.stringify(url.origin + url.pathname + "/reader/profile")}.`;
  }
  if (url.search || url.hash) {
    return `is ${JSON.stringify(value)}; it must be a bare origin with no query string or fragment.`;
  }
  return null;
}

export const LAUNCH_REQUIRED_PRESENT: readonly LaunchRequiredSpec[] = [
  {
    anyOf: ["NEXT_PUBLIC_SITE_URL"],
    reason:
      "WP-05 acceptance criterion. Absolute URLs in receipts, Stripe redirects, and OG tags derive from it.",
    validate: validateSiteUrl,
  },
  // `lib/env.ts` throws on these at runtime, but a throw at runtime is a
  // launch-day outage. The point of this checker is to find them while the fix
  // is still a config edit.
  {
    anyOf: ["NEXT_PUBLIC_SUPABASE_URL"],
    reason: "Every page and route reads the database through it.",
  },
  {
    anyOf: ["NEXT_PUBLIC_SUPABASE_ANON_KEY"],
    reason: "The browser client cannot authenticate a reader without it.",
  },
  {
    anyOf: ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"],
    reason: "Server-side admin client; assertServerEnv accepts either form.",
  },
  {
    anyOf: ["SUPABASE_SERVICE_ROLE_KEY"],
    reason:
      "Webhooks, workers and the author stats routes all read through the service role. assertServerEnv throws without it.",
  },
  {
    anyOf: ["RESEND_API_KEY"],
    reason: "Purchase receipts and support mail. assertServerEnv throws without it.",
  },
  {
    anyOf: ["RESEND_FROM_EMAIL"],
    reason: "Receipts have no sender without it. assertServerEnv throws.",
  },
  {
    anyOf: ["STRIPE_SECRET_KEY"],
    reason:
      "Launch criterion 1 is a real purchase end to end; checkout cannot be created without it.",
  },
  {
    anyOf: ["STRIPE_WEBHOOK_SECRET"],
    reason:
      "Without it the webhook cannot verify signatures, so a completed payment never settles into an order.",
  },
  {
    anyOf: ["STRIPE_CHECKOUT_SUCCESS_URL"],
    reason:
      "api/billing/checkout throws without it, so subscription checkout 500s. Not covered by assertServerEnv.",
  },
  {
    anyOf: ["STRIPE_CHECKOUT_CANCEL_URL"],
    reason:
      "Same route, same throw. A reader who backs out of checkout has nowhere to land.",
  },
  {
    anyOf: ["ELEVENLABS_API_KEY"],
    reason:
      "AUDIOBOOK_ENABLED is on at launch. Without a key the checkout route refuses with AUDIOBOOK_VOICE_UNCONFIGURED — a guard, not a substitute.",
  },
  {
    anyOf: ["ELEVENLABS_VOICE_ID", "TTS_VOICE_ID"],
    reason:
      "AUDIOBOOK_ENABLED is on at launch. A key without a voice id still refuses with AUDIOBOOK_VOICE_UNCONFIGURED at checkout, generation, and preview.",
  },
  {
    anyOf: ["ANTHROPIC_API_KEY", "NVIDIA_NIM_API_KEY"],
    reason:
      "AI_CHAT_ENABLED is on at launch. With neither provider key the route falls back to canned template replies and says so in the panel — a feature switched on and quietly nonfunctional, which is worse than switching it off.",
  },
] as const;

export const ALL_LAUNCH_SPECS: readonly LaunchFlagSpec[] = [
  ...LAUNCH_FLAGS,
  ...LAUNCH_GATES,
];

export type LaunchConfigProblem = {
  key: string;
  severity: "error" | "warning";
  message: string;
};

/**
 * Compare a real environment against the matrix.
 *
 * Both directions judge values with `parseBool`, the function the runtime
 * itself uses — and pass it the raw value, because `parseBool` does not trim.
 * `NEXT_PUBLIC_AUDIOBOOK_ENABLED="true "` is off at runtime, so it has to be
 * off here too, or the checker certifies a build with the feature disabled.
 * An earlier version demanded the literal string "true" for must-be-ON flags on
 * the grounds that middleware compares exactly — but middleware only does that
 * for the two access gates, which are must-be-OFF. The result was a gate that
 * rejected `AUDIOBOOK_ENABLED=1`, a configuration that works.
 */
export function verifyLaunchConfig(
  env: Record<string, string | undefined>,
  target: VerifyTarget = "production"
): LaunchConfigProblem[] {
  const problems: LaunchConfigProblem[] = [];

  for (const spec of ALL_LAUNCH_SPECS) {
    const raw = env[spec.key];
    const isSet = raw != null && raw.trim() !== "";

    if (spec.value === "true") {
      // The public flag is required — the server twin does NOT satisfy this.
      // Client code calls getAudiobookEnabled() / getDiscoveryEnabled(), which
      // read only the NEXT_PUBLIC_ form, so a build carrying just the twin
      // hides the UI while the server thinks the feature is on.
      if (!parseBool(raw)) {
        problems.push({
          key: spec.key,
          severity: "error",
          message: isSet
            ? `is ${JSON.stringify(raw)}, which parseBool reads as off. It must be on for launch. ${spec.reason}`
            : `is unset, must be on.${
                spec.serverTwin && parseBool(env[spec.serverTwin])
                  ? ` ${spec.serverTwin} is on, but client code reads only the NEXT_PUBLIC_ form, so the UI would stay hidden.`
                  : ""
              } ${spec.reason}`,
        });
      }
      continue;
    }

    // Must be off. Unset is the documented default and therefore fine.
    //
    // The access gates are judged by middleware's own rule — an exact match on
    // "true" — not by parseBool. `BETA_LOCK=1` leaves the gate open at runtime,
    // so calling it an error would reject a working deployment. It is still
    // worth saying out loud, because a reader of that config would reasonably
    // assume the opposite, so it warns.
    const isOn = spec.exactMatch ? raw === "true" : parseBool(raw);

    if (isOn) {
      problems.push({
        key: spec.key,
        severity: "error",
        message: `is ${JSON.stringify(raw)}, must be off for launch. ${spec.reason}`,
      });
      continue;
    }

    if (spec.exactMatch && isSet && raw !== "false") {
      problems.push({
        key: spec.key,
        severity: "warning",
        message: `is ${JSON.stringify(raw)}. middleware.ts compares against the literal "true", so the gate is OFF — but the value reads as if it were on. Set it to "false" or remove it.`,
      });
      continue;
    }

    // The server-only twin only matters when the public flag is absent.
    // `flags.ts` resolves with `??`, so an explicit NEXT_PUBLIC_X=false wins
    // and the twin is never read — reporting it there would reject a
    // deployment that behaves correctly.
    if (spec.serverTwin && raw === undefined) {
      const twinValue = env[spec.serverTwin];
      if (parseBool(twinValue)) {
        problems.push({
          key: spec.serverTwin,
          severity: "error",
          message: `is ${JSON.stringify(twinValue)} while ${spec.key} is unset, so flags.ts falls through to it and reads the feature as ON. ${spec.reason}`,
        });
      }
    }
  }

  for (const spec of LAUNCH_REQUIRED_PRESENT) {
    const found = spec.anyOf.find((k) => env[k]?.trim());
    if (!found) {
      problems.push({
        key: spec.anyOf.join(" or "),
        severity: "error",
        message: `is unset. ${spec.reason}`,
      });
      continue;
    }
    const message = spec.validate?.(env[found]!.trim(), target);
    if (message) {
      problems.push({ key: found, severity: "error", message: `${message} ${spec.reason}` });
    }
  }

  for (const spec of ALL_LAUNCH_SPECS) {
    if (!spec.needsConfirmation) continue;
    problems.push({
      key: spec.key,
      severity: "warning",
      message: `defaults to "${spec.value}" on this package's recommendation, not a decision the launch plan made. Confirm before the launch build. ${spec.reason}`,
    });
  }

  return problems;
}
