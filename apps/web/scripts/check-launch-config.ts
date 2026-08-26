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
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config, parse } from "dotenv";
import {
  ALL_LAUNCH_SPECS,
  LAUNCH_REQUIRED_PRESENT,
  verifyLaunchConfig,
  type VerifyTarget,
} from "../src/lib/launch-config";

/**
 * Which env files to read.
 *
 * Default is the cascade `next build` would use, in Next's precedence, with
 * real environment variables winning outright. That is right for checking the
 * machine you are standing on.
 *
 * `--env-file <path>` reads that file and nothing else. Use it to verify a
 * deploy environment, and mixing the local cascade back in would report your
 * development flags as production problems. That false positive is worse than
 * no check, because it trains you to skim past the output.
 *
 * Two things to know about verifying a Vercel environment this way:
 *
 *   1. Pull to a path OUTSIDE apps/web. `next build` reads
 *      `.env.production.local` ahead of `.env.local`, so a pulled file left in
 *      the app directory breaks every local build afterwards — with an error
 *      ("Invalid supabaseUrl") that points nowhere near the cause.
 *
 *   2. Sensitive variables come back as the literal string `[SENSITIVE]`, not
 *      their value. Vercel never hands secrets back. So this verifies that a
 *      secret is SET, never what it is — which is all the matrix asserts about
 *      them anyway. Flags and URLs are non-sensitive and do come back whole.
 *
 * The working incantation:
 *
 *   vercel env pull /tmp/verkli-prod.env --environment production
 *   npm run check:launch-config -- --strict --env-file /tmp/verkli-prod.env
 */
const scriptDir = path.dirname(fileURLToPath(import.meta.url));

const envFileIndex = process.argv.indexOf("--env-file");
const onlyFile = envFileIndex !== -1 ? process.argv[envFileIndex + 1] : null;

let env: Record<string, string | undefined>;

if (onlyFile) {
  const resolved = path.resolve(process.cwd(), onlyFile);
  if (!existsSync(resolved)) {
    console.error(`\n✖  ${resolved} not found.\n`);
    process.exit(1);
  }
  env = parse(readFileSync(resolved, "utf8"));
  console.log(`[env] reading ${onlyFile} only — the local cascade is ignored`);
} else {
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
  env = process.env;
}

const strict = process.argv.includes("--strict");

const targetIndex = process.argv.indexOf("--target");
const target: VerifyTarget = process.argv[targetIndex + 1] === "preview" ? "preview" : "production";

const problems = verifyLaunchConfig(env, target);
const errors = problems.filter((p) => p.severity === "error");
const warnings = problems.filter((p) => p.severity === "warning");

const checked = ALL_LAUNCH_SPECS.length + LAUNCH_REQUIRED_PRESENT.length;

console.log(`\n══ Launch config check — ${target} (${checked} settings) ══\n`);

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
