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

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(__dirname, "..");

// Load .env.local so we can validate billing env vars
config({ path: resolve(webRoot, ".env.local") });

// ── Stage 1: Billing-critical env vars ──────────────────────────────────────

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

function checkEnv() {
  console.log("\n══ Stage 1/4: Environment check ══\n");
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
  console.log(`✔  All ${REQUIRED_ENV.length} required env vars are set.\n`);
}

// ── Stage runners ───────────────────────────────────────────────────────────

function run(label, stage, cmd) {
  console.log(`\n══ Stage ${stage}: ${label} ══\n`);
  try {
    execSync(cmd, { cwd: webRoot, stdio: "inherit" });
    console.log(`\n✔  ${label} passed.\n`);
  } catch {
    console.error(`\n❌  ${label} failed. Fix the errors above and retry.\n`);
    process.exit(1);
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

checkEnv();
run("Tests (vitest)", "2/4", "npx vitest run");
run("Lint (eslint)", "3/4", "npx eslint .");
run("Build (next build)", "4/4", "npx next build");

console.log("\n══════════════════════════════════════");
console.log("  ✔  Beta Release Gate — ALL PASSED");
console.log("══════════════════════════════════════\n");
