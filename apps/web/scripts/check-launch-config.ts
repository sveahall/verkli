/**
 * Verify an environment against the launch flag matrix.
 *
 *   npm run check:launch-config           # report only, exit 0
 *   npm run check:launch-config -- --strict   # exit 1 on any error
 *
 * Run it against the environment the launch build will actually use. Because
 * `NEXT_PUBLIC_*` vars are baked at build time, a mismatch found here is a
 * config edit; the same mismatch found after the build is a redeploy.
 *
 * This imports the matrix from src/lib/launch-config.ts rather than restating
 * it. A checker with its own copy of the rules is a second thing to keep in
 * sync, which is the failure mode WP-05 exists to remove.
 */

import * as path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import {
  ALL_LAUNCH_SPECS,
  LAUNCH_REQUIRED_PRESENT,
  verifyLaunchConfig,
} from "../src/lib/launch-config";

/**
 * Load the same env files `next build` would, in the same precedence order.
 *
 * Two things this must not do, both of which would let the checker certify a
 * configuration the build does not use:
 *
 *   1. Use `./load-dotenv`. It loads .env.local with `override: true`, so
 *      injected shell/CI values would be replaced inside this process only —
 *      the build would then start from the original values.
 *   2. Read only .env.local. For a production build Next also reads
 *      .env.production.local (higher precedence than .env.local),
 *      .env.production, and .env, so a launch-breaking value in any of those
 *      would go unseen.
 *
 * dotenv's `override: false` never replaces an already-set key, so loading in
 * descending precedence gives Next's order with real environment variables
 * winning outright — which is what a Vercel or CI deploy actually supplies.
 */
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const ENV_FILES_HIGHEST_PRECEDENCE_FIRST = [
  ".env.production.local",
  ".env.local",
  ".env.production",
  ".env",
];

const loaded: string[] = [];
for (const name of ENV_FILES_HIGHEST_PRECEDENCE_FIRST) {
  const file = path.resolve(scriptDir, "..", name);
  if (!existsSync(file)) continue;
  config({ path: file, override: false });
  loaded.push(name);
}
if (loaded.length > 0) {
  console.log(
    `[dotenv] fallback files, highest precedence first: ${loaded.join(", ")} (real environment variables still win)`
  );
} else {
  console.log("[dotenv] no env files found — validating the live environment only");
}

const strict = process.argv.includes("--strict");

const problems = verifyLaunchConfig(process.env);
const errors = problems.filter((p) => p.severity === "error");
const warnings = problems.filter((p) => p.severity === "warning");

const checked = ALL_LAUNCH_SPECS.length + LAUNCH_REQUIRED_PRESENT.length;

console.log(`\n══ Launch config check (${checked} settings) ══\n`);

if (errors.length > 0) {
  console.error(`❌  ${errors.length} setting${errors.length === 1 ? "" : "s"} wrong for a launch build:\n`);
  for (const problem of errors) {
    console.error(`   • ${problem.key} ${problem.message}\n`);
  }
}

if (warnings.length > 0) {
  console.warn(`⚠  ${warnings.length} undecided setting${warnings.length === 1 ? "" : "s"}:\n`);
  for (const problem of warnings) {
    console.warn(`   • ${problem.key} ${problem.message}\n`);
  }
}

if (errors.length === 0) {
  console.log(`✔  All ${checked} launch settings match the matrix.\n`);
}

if (!strict && errors.length > 0) {
  console.log(
    "Reporting only — pass --strict to fail on these (use that for the launch build).\n"
  );
}

process.exit(strict && errors.length > 0 ? 1 : 0);
