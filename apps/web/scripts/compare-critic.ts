/**
 * Show what the editorial critic pass actually changes.
 *
 *   npm run compare:critic -- --chapter <uuid>
 *   npm run compare:critic -- --chapter <uuid> --mode analysis --part 2
 *
 * Why this exists
 * ---------------
 * AI_CRITIC_ENABLED costs a second model call per chapter. A flag reading
 * "true" proves only that the code path is reachable, not that the second
 * opinion is worth paying for — and the failure mode that matters is silent:
 * a critic that drops real findings looks exactly like a critic that drops
 * false ones, because both just produce a shorter report.
 *
 * So this prints every dropped and amended item with the critic's own reason,
 * and you judge. If the drops are wrong, turn the flag off; that is a one-line
 * change in lib/launch-config.ts and an env var, not a rollback.
 *
 * It runs the expensive Anthropic generation ONCE and adjudicates that exact
 * report, rather than generating twice with the flag flipped. Two generations
 * would differ on their own and you could not tell model variance from critic
 * effect.
 *
 * Requires --conditions=react-server (the npm script sets it) so that modules
 * guarded by `server-only` are importable outside Next.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { reviewText, splitReviewText } from "../src/lib/editorial/content";
import { generateEditorialReview } from "../src/lib/editorial/provider";
import { adjudicateEditorialReport } from "../src/lib/editorial/adjudicate";
import { reviewModeSchema } from "../src/lib/editorial/review-schema";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
for (const name of [".env.production.local", ".env.local", ".env.production", ".env"]) {
  const file = path.resolve(scriptDir, "..", name);
  if (existsSync(file)) config({ path: file, override: false });
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

function die(message: string): never {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

const chapterId = arg("chapter");
if (!chapterId) die("Pass --chapter <uuid>. Find one in the author editor URL.");

const parsedMode = reviewModeSchema.safeParse(arg("mode") ?? "proofread");
if (!parsedMode.success) die("--mode must be proofread, analysis or translation.");
// Pulled out of the union: discriminated-union narrowing does not survive into
// the async closure below.
const mode = parsedMode.data;
if (mode === "translation") die("Translation comparison requires source text. Use the editor with a selected source edition; this script only supports proofread and analysis.");

const partIndex = Number(arg("part") ?? 0);
if (!Number.isInteger(partIndex) || partIndex < 0) die("--part must be a non-negative integer.");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!SUPABASE_URL || !SERVICE_KEY) die("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
if (!process.env.ANTHROPIC_API_KEY?.trim()) die("ANTHROPIC_API_KEY must be set — it writes the baseline report.");
if (!process.env.OPENAI_API_KEY?.trim()) {
  die("OPENAI_API_KEY must be set — without it the critic no-ops and there is nothing to compare.");
}

const rule = "─".repeat(72);
const truncate = (text: string, max = 160) =>
  text.length > max ? `${text.slice(0, max - 3)}...` : text;

type ChapterRow = { id: string; title: string | null; content: string | null };

/**
 * PostgREST over plain fetch, like the other check:* scripts. The supabase-js
 * client builds a realtime socket on construction and needs Node 22's global
 * WebSocket; nothing here subscribes to anything.
 */
async function fetchChapter(id: string): Promise<ChapterRow | null> {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/chapters?select=id,title,content&id=eq.${encodeURIComponent(id)}&limit=1`,
    {
      headers: { apikey: SERVICE_KEY!, Authorization: `Bearer ${SERVICE_KEY}` },
      signal: AbortSignal.timeout(15_000),
    }
  );
  if (!response.ok) die(`Could not read the chapter: PostgREST returned ${response.status}.`);
  const rows = (await response.json()) as ChapterRow[];
  return rows[0] ?? null;
}

async function main() {
  const chapter = await fetchChapter(chapterId!);
  if (!chapter) die(`No chapter with id ${chapterId}.`);

  const parts = splitReviewText(reviewText(chapter.content));
  const text = parts[partIndex];
  if (!text) die(`Part ${partIndex} does not exist; this chapter has ${parts.length}.`);

  console.log(`\n══ Critic comparison ══\n`);
  console.log(`chapter   ${chapter.title ?? "(untitled)"}`);
  console.log(`mode      ${mode}`);
  console.log(`part      ${partIndex + 1} of ${parts.length}  (${text.length} characters)\n`);

  // Force the flag off so the provider hands back the UNADJUDICATED report;
  // otherwise this would compare an adjudicated report against a twice-
  // adjudicated one.
  process.env.AI_CRITIC_ENABLED = "false";
  console.log("Generating the baseline report (Anthropic)...");
  const baseline = await generateEditorialReview({
    mode,
    text,
    chapterTitle: chapter.title ?? "",
    sourceText: null,
  });

  console.log("Adjudicating it (OpenAI)...\n");
  const { report, stats, decisions } = await adjudicateEditorialReport({ report: baseline, mode, text, sourceText: null });

  if (!stats.ran) {
    die("The critic did not run. Check OPENAI_API_KEY and OPENAI_MODEL — the provider degrades silently by design.");
  }

  console.log(rule);
  console.log(
    `findings     ${baseline.findings.length} → ${report.findings.length}` +
      `   (${stats.findingsDropped} dropped, ${stats.findingsAmended} amended)`
  );
  console.log(
    `corrections  ${baseline.corrections.length} → ${report.corrections.length}` +
      `   (${stats.correctionsDropped} dropped)`
  );
  console.log(rule);

  if (decisions.length === 0) {
    console.log("\nThe critic changed nothing. On this chapter it cost a call and bought nothing.\n");
    return;
  }

  for (const decision of decisions) {
    const verb = decision.verdict === "drop" ? "DROPPED" : "AMENDED";
    console.log(`\n${verb}  (${decision.kind})`);
    console.log(`  item    ${truncate(decision.label)}`);
    console.log(`  reason  ${truncate(decision.reason, 300)}`);
  }

  console.log(`\n${rule}`);
  console.log("Read the reasons, not the counts. A shorter report is only better");
  console.log("if every dropped item deserved to go.\n");
}

main().catch((err) => die(err instanceof Error ? err.message : String(err)));
