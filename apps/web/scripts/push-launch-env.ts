/**
 * Push the launch environment to Vercel production.
 *
 *   npm run push:launch-env            # dry run — shows what it would do
 *   npm run push:launch-env -- --apply # actually writes to Vercel
 *
 * Setting fifteen variables by hand is how a launch build ends up with the
 * demo façade on or the site URL pointing at localhost. This reads the values
 * from `.env.local` and writes them to Vercel, but it is NOT a blind copy —
 * `.env.local` is a development environment and several of its values are
 * actively wrong for production:
 *
 *   - NEXT_PUBLIC_SITE_URL is http://localhost:3000
 *   - TRANSLATIONS, MARKETING and DEMO_FACADE are all on, and the launch plan
 *     cuts all three
 *
 * So secrets are copied, flags are set from `launch-config.ts`, and the
 * must-be-off flags are never sent at all. Values are never printed.
 *
 * Requires `vercel link` to have been run in this directory first.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";
import { LAUNCH_FLAGS, LAUNCH_GATES } from "../src/lib/launch-config";

const apply = process.argv.includes("--apply");
const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Secrets copied verbatim from `.env.local`. Development and production share
 * these today because there is one Supabase project and one Stripe account —
 * which is itself worth revisiting (plan §8 asks test-or-live key), but it is
 * the current reality and this script does not get to change it silently.
 */
const COPY_FROM_LOCAL = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "ELEVENLABS_API_KEY",
  "ELEVENLABS_VOICE_ID",
  "TTS_VOICE_ID",
  "ANTHROPIC_API_KEY",
  "NVIDIA_NIM_API_KEY",
  "PRICE_PLUS",
  "PRICE_PRO",
] as const;

/** Missing these blocks the deploy; the rest are warnings. */
const REQUIRED = new Set([
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "ELEVENLABS_API_KEY",
  "ANTHROPIC_API_KEY",
]);

/**
 * Never read from `.env.local`. The site URL there is localhost, which
 * request-url.ts would reject at runtime while silently falling back to the
 * request host — a wrong value that fails quietly.
 */
const SITE_URL = "https://verkli.com";

function loadLocalEnv(): Record<string, string> {
  const file = path.join(webDir, ".env.local");
  if (!existsSync(file)) {
    console.error(`✖  ${file} not found. Nothing to copy from.`);
    process.exit(1);
  }
  return parse(readFileSync(file, "utf8"));
}

function setVercelEnv(key: string, value: string): string | null {
  // `--force` overwrites an existing value, `--yes` accepts the CLI's own
  // prompts (it asks about sensitive storage and warns on NEXT_PUBLIC_ names),
  // and `--non-interactive` makes a missing prompt an error rather than a hang.
  //
  // The value goes in on stdin, not through `--value`: the CLI supports both,
  // but an argument is visible in the process list to anything running on this
  // machine, and most of these are secrets.
  // NEXT_PUBLIC_* is baked into the client bundle, so it is public by
  // definition and Vercel refuses to store it with secret visibility. That
  // refusal is correct — storing it as a secret would imply a confidentiality
  // the value cannot have. Everything else keeps the default (sensitive).
  const isPublic = key.startsWith("NEXT_PUBLIC_");
  const visibility = isPublic
    ? ["--visibility", "config", "--no-sensitive"]
    : ["--sensitive"];

  const result = spawnSync(
    "vercel",
    [
      "env",
      "add",
      key,
      "production",
      "--force",
      "--yes",
      "--non-interactive",
      ...visibility,
    ],
    { cwd: webDir, input: value, encoding: "utf8" }
  );

  if (result.status === 0) return null;
  return (
    [result.stderr, result.stdout]
      .filter(Boolean)
      .join("\n")
      .trim()
      .split("\n")
      .filter((line) => line.trim() && !line.startsWith("Vercel CLI"))
      .slice(-4)
      .join("\n") || `exit ${result.status}`
  );
}

const local = loadLocalEnv();

const toSet: Array<{ key: string; value: string; source: string }> = [];
const missing: string[] = [];

for (const key of COPY_FROM_LOCAL) {
  const value = local[key]?.trim();
  if (!value) {
    missing.push(key);
    continue;
  }
  toSet.push({ key, value, source: ".env.local" });
}

toSet.push({ key: "NEXT_PUBLIC_SITE_URL", value: SITE_URL, source: "hardcoded" });

// Flags come from the matrix, never from .env.local.
const mustBeOff: string[] = [];
for (const spec of [...LAUNCH_FLAGS, ...LAUNCH_GATES]) {
  if (spec.value === "true") {
    toSet.push({ key: spec.key, value: "true", source: "launch matrix" });
  } else {
    mustBeOff.push(spec.key);
    if (spec.serverTwin) mustBeOff.push(spec.serverTwin);
  }
}

console.log(`\n══ Launch env → Vercel production ${apply ? "(APPLYING)" : "(dry run)"} ══\n`);

console.log(`Will set ${toSet.length} variables:\n`);
for (const { key, source } of toSet) {
  console.log(`   ${key.padEnd(38)} ← ${source}`);
}

if (mustBeOff.length > 0) {
  console.log(`\nWill NOT set ${mustBeOff.length} (unset means off, which is the launch value):\n`);
  for (const key of mustBeOff) console.log(`   ${key}`);
  console.log(
    "\n   If any of these already exist in Vercel, remove them by hand:\n" +
      "     vercel env rm <NAME> production"
  );
}

const blocking = missing.filter((k) => REQUIRED.has(k));
const optional = missing.filter((k) => !REQUIRED.has(k));

if (optional.length > 0) {
  console.log(`\n⚠  Not in .env.local, skipped (optional):\n`);
  for (const key of optional) console.log(`   ${key}`);
}

if (blocking.length > 0) {
  console.error(`\n❌  Missing from .env.local and required for launch:\n`);
  for (const key of blocking) console.error(`   ${key}`);
  console.error("\nAdd them to apps/web/.env.local, then re-run.\n");
  process.exit(1);
}

if (!apply) {
  console.log("\nDry run — nothing was written. Re-run with --apply to push.\n");
  process.exit(0);
}

console.log("");
for (const { key, value } of toSet) {
  process.stdout.write(`   ${key.padEnd(38)} `);
  const failure = setVercelEnv(key, value);
  if (failure) {
    console.log("FAILED");
    console.error(
      failure
        .split("\n")
        .map((l) => `      ${l}`)
        .join("\n")
    );
    process.exit(1);
  }
  console.log("ok");
}

console.log(
  "\n✔  Done. Now verify before building:\n\n" +
    "     vercel env pull /tmp/verkli-prod.env --environment production\n" +
    "     npm run check:launch-config -- --strict --env-file /tmp/verkli-prod.env\n\n" +
    "   Pull OUTSIDE apps/web — next build reads .env.production.local ahead of\n" +
    "   .env.local, so a pulled file left here breaks every local build after.\n"
);
