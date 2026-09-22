#!/usr/bin/env node
/**
 * Beta Release Gate — automated QA check.
 *
 * Usage:  npm run qa:beta
 * Stages: env check → tests → lint → billing catalog → build
 * Exits non-zero on first failure.
 */

import { execSync } from "node:child_process";
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const requireFromHere = createRequire(import.meta.url);

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(__dirname, "..");

// Snapshot the pre-dotenv environment BEFORE loading .env.local. The vitest
// stage runs with this hermetic env (like CI does): feature flags meant for
// the running app — e.g. NEXT_PUBLIC_DEMO_FACADE_ENABLED during pitch prep —
// must not leak into unit tests, where they change code paths (demo-guard
// starts querying `profiles`) and break supabase mocks.
const hermeticEnv = { ...process.env };

// Load .env.local so we can validate billing env vars
config({ path: resolve(webRoot, ".env.local") });

// ── Stage 1: Billing-critical env vars + soft-launch value validation ──────

const REQUIRED_ENV = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "REDIS_URL",
  "NEXT_PUBLIC_SITE_URL",
];

/**
 * Strict value validation for soft-launch env vars. PR 2 (observability)
 * upgrades these from warn-only to hard failures: if BETA_LOCK is set but is
 * anything other than the exact string "true" or "false", qa:beta fails.
 * Production middleware checks for the literal string "true", so " TRUE",
 * "1", or "True" silently disable the gate. Catch it here, not in production.
 */
const SOFT_LAUNCH_VALUE_CHECKS = [
  {
    key: "BETA_LOCK",
    description: 'must equal the literal string "true" or "false"',
    accept: ["true", "false"],
  },
];

function checkEnv() {
  console.log("\n══ Stage 1/10: Environment check ══\n");
  const missing = REQUIRED_ENV.filter((k) => !process.env[k]?.trim());
  if (missing.length > 0) {
    console.error("❌  Missing billing-critical environment variables:\n");
    for (const v of missing) {
      console.error(`   • ${v}`);
    }
    console.error(
      "\nSet them in .env.local (see .env.example) and try again.\n"
    );
    process.exit(1);
  }
  console.log(`✔  All ${REQUIRED_ENV.length} required env vars are set.`);

  // Soft-launch value validation — strict; failure here exits non-zero.
  // Empty string still counts as unset (REQUIRED_ENV check uses trim()).
  for (const { key, description, accept } of SOFT_LAUNCH_VALUE_CHECKS) {
    const raw = process.env[key];
    if (raw == null || raw === "") continue; // unset is fine in non-production contexts
    if (!accept.includes(raw)) {
      console.error(
        `❌  ${key}=${JSON.stringify(raw)} ${description}.`
      );
      console.error(
        `   Production middleware checks for the exact string. " TRUE", "1",`
      );
      console.error(
        `   or "True" all silently DISABLE the gate. Fix before deploying.\n`
      );
      process.exit(1);
    }
  }

  // TRUSTED_PROXY_HOPS, when set, must parse to a non-negative integer.
  const hopsRaw = process.env.TRUSTED_PROXY_HOPS;
  if (hopsRaw != null && hopsRaw.trim() !== "") {
    const hops = Number.parseInt(hopsRaw, 10);
    if (!Number.isFinite(hops) || hops < 0 || String(hops) !== hopsRaw.trim()) {
      console.warn(
        `⚠  TRUSTED_PROXY_HOPS=${JSON.stringify(hopsRaw)} is not a non-negative integer.`
      );
      console.warn(
        `   getClientIpFromRequest will treat invalid values as 0 and use the`
      );
      console.warn(
        `   left-most XFF entry. Set explicitly per your proxy chain.\n`
      );
    }
  }

  console.log("");
}

/**
 * Reachability check for REDIS_URL. Boots a short-lived ioredis client and
 * issues PING. Fails the gate when the URL is set but unreachable: rate
 * limiters and queue workers depend on Redis, and a silent fall-back to
 * in-memory rate limits in production loses cross-instance budget.
 *
 * Skips cleanly if REDIS_URL is unset or unparseable — those cases are
 * surfaced by REQUIRED_ENV / runtime warnings, not here.
 */
async function checkRedisReachable() {
  console.log("══ Stage 1b/10: Redis reachability ══\n");
  const url = process.env.REDIS_URL?.trim();
  if (!url) {
    // REQUIRED_ENV already failed if REDIS_URL was missing.
    console.log("(skipped — REDIS_URL not set)\n");
    return;
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    console.error(`❌  REDIS_URL=${JSON.stringify(url)} is not a valid URL.\n`);
    process.exit(1);
  }
  if (parsed.protocol !== "redis:" && parsed.protocol !== "rediss:") {
    console.error(
      `❌  REDIS_URL protocol must be redis: or rediss:; got ${parsed.protocol}.\n`
    );
    process.exit(1);
  }

  let Redis;
  try {
    const mod = requireFromHere("ioredis");
    Redis = mod.default ?? mod;
  } catch {
    console.warn(
      "⚠  ioredis not installed under apps/web; skipping Redis ping.\n"
    );
    return;
  }

  const port = parsed.port ? Number.parseInt(parsed.port, 10) : 6379;
  const client = new Redis({
    host: parsed.hostname,
    port,
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    ...(parsed.protocol === "rediss:" ? { tls: {} } : {}),
    connectTimeout: 5000,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
    lazyConnect: true,
    enableOfflineQueue: false,
  });

  // Swallow the "Unhandled error" log; we surface the failure ourselves below.
  client.on("error", () => {});

  try {
    await client.connect();
    const pong = await client.ping();
    if (pong !== "PONG") {
      console.error(
        `❌  REDIS_URL reachable but PING returned ${JSON.stringify(pong)}.\n`
      );
      process.exit(1);
    }
    console.log(`✔  Redis reachable at ${parsed.hostname}:${port}.\n`);
  } catch (err) {
    console.error(
      `❌  REDIS_URL not reachable: ${err instanceof Error ? err.message : String(err)}\n`
    );
    process.exit(1);
  } finally {
    try {
      await client.quit();
    } catch {
      client.disconnect();
    }
  }
}

// ── Stage runners ───────────────────────────────────────────────────────────

function run(label, stage, cmd, env = process.env) {
  console.log(`\n══ Stage ${stage}: ${label} ══\n`);
  try {
    execSync(cmd, { cwd: webRoot, stdio: "inherit", env });
    console.log(`\n✔  ${label} passed.\n`);
  } catch {
    console.error(`\n❌  ${label} failed. Fix the errors above and retry.\n`);
    process.exit(1);
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

checkEnv();
await checkRedisReachable();
run("Tests (vitest)", "2/12", "npx vitest run", hermeticEnv);
run("Lint (eslint)", "3/12", "npx eslint .");
run("English-default check", "4/12", "npx tsx scripts/check-english-default.ts");
run("No-placeholders check", "5/12", "npm run check:no-placeholders");
run("Dead-code check", "6/12", "npm run check:dead-code");
// Asks each vendor whether the key we hold is actually accepted. "Set" and
// "valid" are different questions and nothing else here asked the second:
// production shipped an OPENAI_API_KEY with one extra leading character, every
// call 401'd, and because the callers degrade quietly the editorial critic just
// stopped running with no error anywhere. Reporting only — a developer with
// placeholder keys is not a release blocker. Pass --strict for the launch build.
run("AI provider key check", "7/12", "npx tsx scripts/check-ai-providers.ts");
// Asks Stripe whether the catalog's price ids actually exist in the mode the
// configured key talks to. Without credentials the check skips. A problem it
// actually finds fails this gate. --strict is only for turning that skip
// into a failure.
run("Billing catalog check", "8/12", "npx tsx scripts/check-billing-catalog.ts");
// Compares the events the dispatch switch handles against what the live Stripe
// endpoint is subscribed to. A mismatch fails the gate. Missing credentials skip.
run("Stripe webhook subscription check", "9/12", "npx tsx scripts/check-stripe-webhook.ts");
// Asks Redis which queues actually have a worker attached. Not --strict: a
// developer without the worker processes running is not a release blocker.
run("Queue consumer check", "10/12", "npx tsx scripts/check-queue-consumers.ts");
// Counts the PERMISSIVE SELECT policies on `chapters` and, when a paid book is
// published, probes it with the anon key. Both are needed: on 2026-09-10 the
// policy in git was correct and anon still read a 49 kr book, because two
// dashboard-written policies OR'd it open. No service-role key locally is a
// skip, not a failure. An open paywall fails the gate.
run("RLS paywall check", "11/12", "npx tsx scripts/check-rls-paywall.ts");
run("Build (next build)", "12/12", "npx next build");

console.log("\n══════════════════════════════════════");
console.log("  ✔  Beta Release Gate — ALL PASSED");
console.log("══════════════════════════════════════\n");
