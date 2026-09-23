/** Offline by default. --live makes at most 20 provider calls on original fixtures. */
import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { EVALUATION_CASES } from "../src/lib/ai/translation-quality/evaluation-corpus";
import { corpusFingerprint, runEvaluation } from "../src/lib/ai/translation-quality/evaluation";
import { reviewTranslationCandidate } from "../src/lib/ai/translation-quality/anthropic";
import { QUALITY_MODEL, QUALITY_RUBRIC_VERSION } from "../src/lib/ai/translation-quality/types";

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--live" && !arg.startsWith("--out=") && !arg.startsWith("--cases="))) throw new Error("Usage: tsx scripts/evaluate-translation-quality.ts [--live] [--out=/absolute/report.json] [--cases=id,id]");
  const ids = args.find((arg) => arg.startsWith("--cases="))?.slice(8).split(",");
  if (ids && (new Set(ids).size !== ids.length || ids.some((id) => !EVALUATION_CASES.some((sample) => sample.id === id)))) throw new Error("Unknown or duplicate case ID.");
  const cases = ids ? EVALUATION_CASES.filter((sample) => ids.includes(sample.id)) : EVALUATION_CASES;
  const fingerprint = await corpusFingerprint();
  if (!args.includes("--live")) {
    console.log(JSON.stringify({ mode: "offline", cases: cases.map((sample) => sample.id), corpusFingerprint: fingerprint, model: QUALITY_MODEL, rubric: QUALITY_RUBRIC_VERSION, maxProviderCalls: cases.length * 2, message: "No model calls made. Use --live to evaluate these original fixtures." }, null, 2));
    return;
  }
  const output = args.find((arg) => arg.startsWith("--out="))?.slice(6);
  if (!output || !path.isAbsolute(output)) throw new Error("Live runs require --out=/absolute/report.json.");
  // Reserve an exclusive output before making paid calls; never overwrite a run.
  const file = await fs.open(output, "wx", 0o600);
  try {
    dotenv.config({ path: path.join(process.cwd(), ".env.local"), override: false, quiet: true });
    if (!process.env.ANTHROPIC_API_KEY?.trim()) throw new Error("ANTHROPIC_API_KEY is required for a live run.");
    const report = await runEvaluation(cases, reviewTranslationCandidate, "live", (result) => {
      console.log(`[translation evaluation] ${result.caseId}: ${result.outcome} (${result.elapsedMs}ms)`);
    });
    await file.writeFile(JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ report: output, ...report.summary }));
    if (!report.summary.allDecisionsMatched) process.exitCode = 1;
  } finally { await file.close(); }
}
main().catch(() => { console.error("[translation evaluation] Run failed. Check command arguments, output path and provider configuration. No successful evaluation is implied."); process.exitCode = 1; });
