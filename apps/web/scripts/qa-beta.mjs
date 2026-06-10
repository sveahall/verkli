#!/usr/bin/env node
/**
 * Beta Release Gate — automated QA check.
 *
 * Usage:  npm run qa:beta
 * Stages: env check → tests → lint → build
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
  console.log("\n══ Stage 1/7: Environment check ══\n");
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
  console.log("══ Stage 1b/7: Redis reachability ══\n");
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
run("Tests (vitest)", "2/7", "npx vitest run", hermeticEnv);
run("Lint (eslint)", "3/7", "npx eslint .");
run("English-default check", "4/7", "npx tsx scripts/check-english-default.ts");
run("No-placeholders check", "5/7", "npm run check:no-placeholders");
run("Dead-code check", "6/7", "npm run check:dead-code");
run("Build (next build)", "7/7", "npx next build");

console.log("\n══════════════════════════════════════");
console.log("  ✔  Beta Release Gate — ALL PASSED");
console.log("══════════════════════════════════════\n");
