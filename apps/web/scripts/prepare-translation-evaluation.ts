/** Offline-only preparation. It is deliberately impossible to start a paid run here. */
import fs from "node:fs/promises";
import path from "node:path";
import { createEvaluationBundle } from "./fixtures/translation-evaluation-bundle";

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !args[0].startsWith("--out=") || !path.isAbsolute(args[0].slice(6))) throw new Error("Use --out=/absolute/new-directory. There is no live mode.");
  const directory = args[0].slice(6);
  const bundle = createEvaluationBundle();
  await fs.mkdir(directory, { mode: 0o700 }); // Never overwrite an earlier run.
  for (const [name, value] of Object.entries(bundle)) await fs.writeFile(path.join(directory, `${name}.json`), JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({ directory, languages: bundle.manifest.languages.length, providerCallsMade: 0, structuralPlans: bundle.manifest.structuralPlans }, null, 2));
}
main().catch((error) => { console.error("[translation evaluation preparation]", error instanceof Error ? error.message : "Preparation failed"); process.exitCode = 1; });
