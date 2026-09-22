/**
 * Fail if an AI provider key is configured but rejected.
 *
 *   npm run check:ai-providers              # report only, exit 0
 *   npm run check:ai-providers -- --strict  # exit 1 on any broken key
 *
 * Why this exists
 * ---------------
 * On 2026-09-22 production's OPENAI_API_KEY carried one extra leading
 * character. Every call 401'd. Nothing reported it: `isOpenAiConfigured()`
 * returns true for any non-blank string, and every caller treats a provider
 * failure as "degrade quietly" — the editorial critic just stopped running.
 * Authors kept paying for the Anthropic half of a two-model pass and silently
 * got one model.
 *
 * "Set" and "valid" are different questions and the repo only ever asked the
 * first. This asks the second, with the cheapest authenticated call each vendor
 * offers. Nothing here generates billable output.
 *
 * A key that is absent is a deployment choice, not a fault, and is skipped.
 */
import "./load-dotenv";
import { probeAllProviders, brokenProviders } from "../src/lib/usage/provider-health";

const strict = process.argv.includes("--strict");

async function main() {
  const probes = await probeAllProviders();

  for (const p of probes) {
    const mark = !p.configured ? "–" : p.ok ? "✔" : "✘";
    console.log(`  ${mark} ${p.provider.padEnd(11)} ${p.envVar.padEnd(20)} ${p.detail}`);
  }

  const broken = brokenProviders(probes);
  if (broken.length === 0) {
    console.log("\ncheck:ai-providers ok — every configured key was accepted");
    return;
  }

  console.error(`\n${broken.length} provider key(s) configured but not working:`);
  for (const p of broken) {
    console.error(`  ${p.envVar}: ${p.detail}`);
  }
  console.error(
    "\nThe calling code degrades quietly on a provider failure, so this will not\n" +
      "surface as an error anywhere else — it will look like the feature is off."
  );
  if (strict) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
