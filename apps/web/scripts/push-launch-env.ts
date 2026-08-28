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
import {
  LAUNCH_FLAGS,
  LAUNCH_GATES,
  LAUNCH_REQUIRED_PRESENT,
} from "../src/lib/launch-config";

const apply = process.argv.includes("--apply");

const targetIndex = process.argv.indexOf("--target");
const target = targetIndex !== -1 ? process.argv[targetIndex + 1] : "production";
if (target !== "production" && target !== "preview") {
  console.error(`✖  --target must be "production" or "preview", got ${JSON.stringify(target)}`);
  process.exit(1);
}
const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Secrets copied verbatim from `.env.local`. Development and production share
 * these today because there is one Supabase project and one Stripe account —
 * which is itself worth revisiting (plan §8 asks test-or-live key), but it is
 * the current reality and this script does not get to change it silently.
 */
/**
 * Copied for their path, not their host.
 *
 * `.env.local` points these at localhost, which is correct there and would
 * strand a paying customer in production. The path and query are the real
 * information — which page a customer lands on after paying — so those are
 * kept and the origin is swapped for the target's. Inventing paths here would
 * be guessing at product decisions; rebasing preserves them.
 */
const REBASE_ONTO_SITE_URL = new Set([
  "STRIPE_CHECKOUT_SUCCESS_URL",
  "STRIPE_CHECKOUT_CANCEL_URL",
  "STRIPE_CUSTOMER_PORTAL_RETURN_URL",
]);

function rebaseOntoSiteUrl(value: string): string {
  try {
    const original = new URL(value);
    const rebased = new URL(original.pathname + original.search + original.hash, SITE_URL);
    return rebased.toString();
  } catch {
    return value;
  }
}

const COPY_FROM_LOCAL = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_CHECKOUT_SUCCESS_URL",
  "STRIPE_CHECKOUT_CANCEL_URL",
  "STRIPE_CUSTOMER_PORTAL_RETURN_URL",
  "ELEVENLABS_API_KEY",
  "ELEVENLABS_VOICE_ID",
  "ELEVENLABS_MODEL_ID",
  "ELEVENLABS_OUTPUT_FORMAT",
  "TTS_VOICE_ID",
  "ANTHROPIC_API_KEY",
  // NIM powers the writing-assistant fallback. Cover generation moved to
  // fal.ai after NVIDIA's image endpoints stopped answering for this account.
  "NVIDIA_NIM_API_KEY",
  "FAL_KEY",
  "HF_CREDENTIALS",
  "PRICE_PLUS",
  "PRICE_PRO",
] as const;

/**
 * What counts as missing is decided by the matrix, not restated here.
 *
 * A flat list of required keys was wrong in both directions: it rejected an
 * environment with only NVIDIA_NIM_API_KEY, which `generateWritingAssistantReply`
 * accepts, and it let an environment with an ElevenLabs key but no voice id
 * through, which every audiobook route rejects. Two copies of a requirement
 * drift; one does not.
 *
 * NEXT_PUBLIC_SITE_URL is excluded because this script supplies it rather than
 * copying it.
 */
const REQUIRED_SPECS = LAUNCH_REQUIRED_PRESENT.filter(
  (spec) => !spec.anyOf.includes("NEXT_PUBLIC_SITE_URL")
);

/**
 * Required by the matrix, deliberately NOT managed here.
 *
 * `.env.local` has `redis://localhost:6379`, and a local Redis is not a thing
 * that can be copied to a deployment — the target needs its own instance
 * (Upstash, Railway, whatever). Silently passing the requirement because the
 * key exists locally would be the worst outcome: the check goes green while the
 * target has no queue at all, and audiobook generation answers
 * E_QUEUE_UNAVAILABLE after taking the payment claim.
 */
const NOT_MANAGED_HERE = new Set(["REDIS_URL"]);

/**
 * Never read from `.env.local`. The site URL there is localhost, which
 * request-url.ts would reject at runtime while silently falling back to the
 * request host — a wrong value that fails quietly.
 *
 * Preview gets a *.vercel.app value on purpose. `lib/env.ts` requires the
 * variable to be non-empty, but `request-url.ts` deliberately rejects any
 * .vercel.app host and falls back to the host the request actually arrived on.
 * That is exactly right for a preview, whose URL changes per deployment: Stripe
 * redirects land back on the preview the tester is using. Setting the real
 * domain here would be worse than useless — it would bounce a tester mid-
 * checkout onto production.
 */
const SITE_URL =
  target === "production" ? "https://verkli.com" : "https://verkli-web.vercel.app";

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
      target,
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
  const raw = local[key]?.trim();
  if (!raw) {
    missing.push(key);
    continue;
  }
  const rebase = REBASE_ONTO_SITE_URL.has(key);
  const value = rebase ? rebaseOntoSiteUrl(raw) : raw;
  toSet.push({
    key,
    value,
    source: rebase && value !== raw ? `.env.local, rebased onto ${SITE_URL}` : ".env.local",
  });
}

toSet.push({ key: "NEXT_PUBLIC_SITE_URL", value: SITE_URL, source: "hardcoded" });

// Flags come from the matrix, never from .env.local.
//
// A must-be-off flag is not simply skipped: if it already exists in Vercel as
// `true` — as NEXT_PUBLIC_WAITLIST_ONLY does — skipping it leaves the feature
// on while the push reports success. So they are written as "false", which is
// off under both `parseBool` and middleware's literal comparison.
//
// The two ACCESS GATES are the deliberate exception. Turning WAITLIST_ONLY off
// makes verkli.com public the moment the next build ships. That is a launch
// decision, not a config detail, and a script that does it as a side effect of
// "push the env" is a script that opens a company's front door by accident.
// They are reported and left alone unless --open-gates says otherwise.
const openGates = process.argv.includes("--open-gates");
const gateKeys = new Set(LAUNCH_GATES.map((s) => s.key));

const toClear: string[] = [];
const gatesLeftAlone: string[] = [];

for (const spec of [...LAUNCH_FLAGS, ...LAUNCH_GATES]) {
  if (spec.value === "true") {
    toSet.push({ key: spec.key, value: "true", source: "launch matrix" });
    continue;
  }

  const keys = [spec.key, ...(spec.serverTwin ? [spec.serverTwin] : [])];

  if (gateKeys.has(spec.key) && !openGates) {
    gatesLeftAlone.push(...keys);
    continue;
  }

  for (const key of keys) {
    toSet.push({ key, value: "false", source: "launch matrix (off)" });
    toClear.push(key);
  }
}

const unmanaged = REQUIRED_SPECS.filter((spec) =>
  spec.anyOf.some((key) => NOT_MANAGED_HERE.has(key))
);

console.log(`\n══ Launch env → Vercel ${target} ${apply ? "(APPLYING)" : "(dry run)"} ══\n`);

console.log(`Will set ${toSet.length} variables:\n`);
for (const { key, source } of toSet) {
  console.log(`   ${key.padEnd(38)} ← ${source}`);
}

if (toClear.length > 0) {
  console.log(
    `\nWill write "false" to ${toClear.length} launch-cut flags, so an existing "true" cannot survive.\n`
  );
}

if (unmanaged.length > 0) {
  console.log(`\nRequired in ${target}, but this script does not manage them:\n`);
  for (const spec of unmanaged) {
    console.log(`   ${spec.anyOf.join(" or ")}`);
    console.log(`      ${spec.reason}\n`);
  }
  console.log(
    `   Set them in the Vercel dashboard, then confirm with\n` +
      `     npm run check:launch-config -- --strict --target ${target} --env-file <pulled file>`
  );
}

if (gatesLeftAlone.length > 0) {
  console.log(`\nAccess gates — reported, NOT touched:\n`);
  for (const key of gatesLeftAlone) console.log(`   ${key}`);
  console.log(
    "\n   Turning these off makes the site publicly reachable on the next\n" +
      "   build. That is a launch decision. Pass --open-gates when you mean it,\n" +
      `   or clear them by hand: vercel env rm <NAME> ${target}`
  );
}

// A spec is satisfied when any one of its alternatives is present AND passes
// the matrix's own validator. Presence alone is not enough: `.env.local`
// documents localhost values for the Stripe redirects, and copying those to
// production would send a customer who just paid to a machine that is not on
// the internet. Catching it here means the bad value never reaches Vercel,
// rather than being caught by the checker after it is already written.
const unsatisfied: Array<{ anyOf: readonly string[]; reason: string }> = [];

for (const spec of REQUIRED_SPECS) {
  if (spec.anyOf.some((key) => NOT_MANAGED_HERE.has(key))) continue;
  const found = spec.anyOf.find((key) => local[key]?.trim());
  if (!found) {
    unsatisfied.push(spec);
    continue;
  }
  const raw = local[found]!.trim();
  const effective = REBASE_ONTO_SITE_URL.has(found) ? rebaseOntoSiteUrl(raw) : raw;
  const problem = spec.validate?.(effective, target);
  if (problem) {
    unsatisfied.push({ anyOf: [found], reason: problem });
  }
}
const blockingKeys = new Set(unsatisfied.flatMap((spec) => spec.anyOf));
const optional = missing.filter((k) => !blockingKeys.has(k));

if (optional.length > 0) {
  console.log(`\n⚠  Not in .env.local, skipped (optional):\n`);
  for (const key of optional) console.log(`   ${key}`);
}

if (unsatisfied.length > 0) {
  console.error(`\n❌  Missing from .env.local and required for launch:\n`);
  for (const spec of unsatisfied) {
    console.error(`   ${spec.anyOf.join(" or ")}`);
    console.error(`      ${spec.reason}\n`);
  }
  console.error("Add them to apps/web/.env.local, then re-run.\n");
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
    `     vercel env pull /tmp/verkli-${target}.env --environment ${target}\n` +
    `     npm run check:launch-config -- --strict --env-file /tmp/verkli-${target}.env\n\n` +
    "   Pull OUTSIDE apps/web — next build reads .env.production.local ahead of\n" +
    "   .env.local, so a pulled file left here breaks every local build after.\n"
);
