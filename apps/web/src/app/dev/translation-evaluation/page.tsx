import { readFile } from "node:fs/promises";
import path from "node:path";
import { notFound } from "next/navigation";
import EvaluationWorkbench from "./workbench";

export default async function TranslationEvaluationPage() {
  if (process.env.NODE_ENV === "production") notFound();
  // Only the committed original-fixture report is exposed, never an arbitrary
  // local file or customer manuscript. The route is absent in production.
  const recordedReport = await readFile(path.resolve(process.cwd(), "../../docs/qa/fixtures/translation-review-v2-2026-09-14.json"), "utf8").catch(() => null);
  return <EvaluationWorkbench recordedReport={recordedReport} />;
}
