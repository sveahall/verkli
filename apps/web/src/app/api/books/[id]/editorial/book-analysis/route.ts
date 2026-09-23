import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPerUserRateLimiter } from "@/lib/rate-limit";
import { isAiChatEnabled } from "@/lib/flags";
import { checkBudget, releaseBudget, BudgetExceededError } from "@/lib/workers/budget";
import { reviewText } from "@/lib/editorial/content";
import { splitBookAnalysis } from "@/lib/editorial/book-analysis-content";
import { generateBookAnalysisNotes, generateBookAnalysisReport, estimateBookAnalysisNotesUnits, estimateBookAnalysisReportUnits } from "@/lib/editorial/book-analysis-provider";
import { analysisManifestSchema, analysisRunSchema, type AnalysisManifest, type AnalysisRun, type BookAnalysisResult } from "@/lib/editorial/book-analysis-run-schema";
import type { Json } from "@/lib/supabase/types";
import { isBrowserOriginAllowed } from "@/lib/request-url";

export const runtime = "nodejs";
export const maxDuration = 60;
const limiter = createPerUserRateLimiter({ name: "whole-book-analysis", maxPerMinute: 30 });
const kind = "editorial_book_analysis";
const columns = "id,status,created_at,input,output,error,progress";
const headers = { "Cache-Control": "no-store" };
class AnalysisError extends Error { constructor(message: string, readonly status: number) { super(message); } }
const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), versionId: z.string().uuid() }),
  z.object({ action: z.literal("abandon"), versionId: z.string().uuid(), jobId: z.string().uuid() }),
  z.object({ action: z.literal("advance"), versionId: z.string().uuid(), jobId: z.string().uuid(), expectedPart: z.number().int().min(0).max(100) }),
]);
type Job = { id: string; status: string; created_at: string; input: unknown; output: unknown; error: string | null; progress: number };
const response = (data: unknown, status = 200) => NextResponse.json(data, { status, headers });

function unavailableReason(): string | null {
  // Chapter review shares the allowance and provider, but must not activate this
  // separate workflow before its own release checks have been completed.
  if (process.env.WHOLE_BOOK_ANALYSIS_ENABLED !== "true") return "Whole-book analysis is not enabled yet. You can still read saved reports or stop an unfinished analysis.";
  if (!isAiChatEnabled()) return "Editorial AI is currently turned off. Your manuscript has not changed.";
  const cap = Number(process.env.EDITORIAL_DAILY_BUDGET);
  if (!Number.isSafeInteger(cap) || cap <= 0) return "Whole-book analysis is unavailable until the daily editorial AI allowance is configured.";
  if (!process.env.ANTHROPIC_API_KEY?.trim()) return "Editorial AI is not configured. Please contact support.";
  return null;
}

async function manuscript(db: Awaited<ReturnType<typeof createClient>>, bookId: string, versionId: string, userId: string) {
  const { data: book, error: bookError } = await db.from("books").select("id,author_id,deleted_at").eq("id", bookId).maybeSingle();
  if (bookError) throw new AnalysisError("Could not load your book. Please try again.", 503);
  if (!book || book.deleted_at) throw new AnalysisError("Book not found.", 404);
  if (book.author_id !== userId) throw new AnalysisError("You can only analyse your own books.", 403);
  const { data: version, error: versionError } = await db.from("book_versions").select("id,book_id").eq("id", versionId).eq("book_id", bookId).maybeSingle();
  if (versionError) throw new AnalysisError("Could not load this edition.", 503);
  if (!version) throw new AnalysisError("Edition not found in this book.", 404);
  const { data: rows, error } = await db.from("chapters").select("id,title,content,order,updated_at,version_number")
    .eq("book_id", bookId).eq("book_version_id", versionId).is("deleted_at", null).order("order").order("id").limit(1001);
  if (error || !rows) throw new AnalysisError("Could not load all chapters. No partial manuscript will be analysed.", 503);
  if (rows.length > 1000) throw new AnalysisError("This edition has too many chapters for a whole-book analysis.", 422);
  const fingerprint = createHash("sha256").update(JSON.stringify(rows)).digest("hex");
  const chapters = rows.map((row) => ({ id: row.id, title: row.title ?? "Untitled chapter", order: row.order, text: reviewText(row.content) }));
  return { fingerprint, chapters, emptyChapters: chapters.filter((chapter) => !chapter.text.trim()).length };
}
function parseJob(job: Job) {
  const manifest = analysisManifestSchema.safeParse(job.input);
  const run = analysisRunSchema.safeParse(job.output);
  if (!manifest.success || !run.success || run.data.completedParts > manifest.data.partCount || !["pending", "processing", "completed", "failed"].includes(job.status)) {
    throw new AnalysisError("This saved analysis could not be read. Start a new analysis.", 422);
  }
  if (job.status === "completed" && (!run.data.report || run.data.completedParts !== manifest.data.partCount)) throw new AnalysisError("This analysis has no complete report.", 422);
  return { manifest: manifest.data, run: run.data };
}
function result(job: Job, currentFingerprint: string): BookAnalysisResult {
  const { manifest, run } = parseJob(job);
  return { jobId: job.id, status: job.status as BookAnalysisResult["status"], createdAt: job.created_at,
    completedParts: run.completedParts, totalParts: manifest.partCount, chapters: manifest.chapters,
    emptyChapters: manifest.emptyChapters, report: job.status === "completed" ? run.report : null,
    error: job.error, stale: manifest.fingerprint !== currentFingerprint };
}
function handleError(error: unknown) {
  console.error("[book analysis] request failed", { errorType: error instanceof Error ? error.name : "unknown" });
  return response({ error: error instanceof AnalysisError ? error.message : "The analysis could not be loaded. Please try again." }, error instanceof AnalysisError ? error.status : 503);
}
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAuthorRoleForApi();
  if (gate.response) return gate.response;
  const userId = gate.user.id;
  try {
    const { id } = await params;
    const versionId = request.nextUrl.searchParams.get("versionId");
    if (!z.string().uuid().safeParse(id).success || !z.string().uuid().safeParse(versionId).success) throw new AnalysisError("Choose a valid book edition.", 400);
    const db = await createClient();
    const current = await manuscript(db, id, versionId!, userId);
    const { data, error } = await db.from("ai_jobs").select(columns).eq("book_id", id).eq("book_version_id", versionId!).eq("user_id", userId).eq("kind", kind).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw new AnalysisError("Could not load the saved analysis.", 503);
    const reason = unavailableReason();
    return response({ analysis: data ? result(data as Job, current.fingerprint) : null, available: reason === null, unavailableReason: reason });
  } catch (error) { return handleError(error); }
}
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAuthorRoleForApi();
  if (gate.response) return gate.response;
  const userId = gate.user.id;
  let admin: ReturnType<typeof createAdminClient> | null = null;
  let ownedJob: Job | null = null;
  let run: AnalysisRun | null = null;
  let reserved = false;
  let modelStarted = false;
  let completionAttempted = false;
  let reservationId = "";
  try {
    if (!isBrowserOriginAllowed(request)) throw new AnalysisError("Request origin is not allowed.", 403);
    const { id } = await params;
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!z.string().uuid().safeParse(id).success || !parsed.success) throw new AnalysisError("Choose a valid edition and analysis step.", 400);
    if (!(await limiter.check(userId)).allowed) throw new AnalysisError("Too many analysis requests. Wait a minute and continue.", 429);
    const body = parsed.data;
    if (body.action !== "abandon") {
      const reason = unavailableReason();
      if (reason) throw new AnalysisError(reason, 503);
    }
    const db = await createClient();
    const current = await manuscript(db, id, body.versionId, userId);
    let parts;
    try { parts = body.action === "abandon" ? [] : splitBookAnalysis(current.chapters); } catch (error) { throw new AnalysisError(error instanceof Error ? error.message : "This manuscript is too large to analyse.", 422); }
    if (body.action !== "abandon" && current.chapters.filter((chapter) => chapter.text.trim()).length < 2) throw new AnalysisError("Add text to at least two chapters for a cross-chapter analysis. You can review a single chapter with the existing chapter tools.", 422);
    admin = createAdminClient();
    if (body.action === "start") {
      const manifest: AnalysisManifest = { protocol: "whole-book-v1", versionId: body.versionId, fingerprint: current.fingerprint, partCount: parts.length,
        emptyChapters: current.emptyChapters, chapters: current.chapters.map(({ id, title, order }) => ({ id, title, order })) };
      const initial: AnalysisRun = { completedParts: 0, notes: [], receipts: [], report: null };
      const { data, error } = await admin.from("ai_jobs").insert({ id: randomUUID(), user_id: userId, book_id: id, book_version_id: body.versionId,
        kind, status: "pending", progress: 0, input: manifest as unknown as Json, output: initial as unknown as Json }).select(columns).maybeSingle();
      if (error || !data) throw new AnalysisError("Could not create your analysis. No AI work was started.", 503);
      return response({ analysis: result(data as Job, current.fingerprint) });
    }
    const { data: found, error: findError } = await admin.from("ai_jobs").select(columns).eq("id", body.jobId).eq("user_id", userId).eq("book_id", id).eq("book_version_id", body.versionId).eq("kind", kind).maybeSingle();
    if (findError) throw new AnalysisError("Could not load this analysis run.", 503);
    if (!found) throw new AnalysisError("Analysis not found in this book.", 404);
    const job = found as Job;
    const stored = parseJob(job);
    if (body.action === "abandon") {
      if (job.status !== "pending" && job.status !== "processing") throw new AnalysisError("Only an unfinished analysis can be stopped. Refresh its status.", 409);
      const { data: stopped, error: stopError } = await admin.from("ai_jobs").update({ status: "failed",
        error: "Stopped by you. Requests already sent may still finish and count towards your AI allowance. Start a new analysis when ready.", finished_at: new Date().toISOString() })
        .eq("id", job.id).eq("user_id", userId).eq("status", job.status).eq("progress", job.progress)
        .eq("output->>completedParts", String(stored.run.completedParts)).select(columns).maybeSingle();
      // Preserve the stored output and paid receipts, including usage written
      // concurrently. Never retry or refund a potentially dispatched request.
      if (stopError || !stopped) throw new AnalysisError("The analysis changed while stopping it. Refresh its status before trying again.", 409);
      return response({ analysis: result(stopped as Job, current.fingerprint) });
    }
    if (stored.manifest.fingerprint !== current.fingerprint) throw new AnalysisError("Your manuscript changed since this analysis started. Start a new analysis to include those changes.", 409);
    if (job.status === "completed" || body.expectedPart < stored.run.completedParts) return response({ analysis: result(job, current.fingerprint) });
    if (job.status !== "pending" || body.expectedPart !== stored.run.completedParts) throw new AnalysisError(job.status === "processing" ? "This part is still processing. Check its status before continuing; do not start the same work again." : "This analysis cannot continue. Start a new analysis.", 409);
    const { data: claimed, error: claimError } = await admin.from("ai_jobs").update({ status: "processing", started_at: job.created_at })
      .eq("id", job.id).eq("user_id", userId).eq("status", "pending").eq("progress", job.progress).eq("output->>completedParts", String(stored.run.completedParts)).select(columns).maybeSingle();
    if (claimError || !claimed) throw new AnalysisError("Another request is processing this analysis. Refresh its status.", 409);
    ownedJob = claimed as Job;
    run = stored.run;
    const synthesis = run.completedParts === parts.length;
    const step = run.completedParts;
    let units: number;
    try { units = synthesis ? estimateBookAnalysisReportUnits(current.chapters, run.notes) : estimateBookAnalysisNotesUnits(parts[step]); } catch (error) { throw new AnalysisError(error instanceof Error ? error.message : "This manuscript is too large for analysis.", 422); }
    reservationId = `${job.id}:${step}`;
    await checkBudget({ userId: userId, pipeline: "editorial", units, jobId: reservationId });
    reserved = true;
    const receipt: AnalysisRun["receipts"][number] = { step, reservedUnits: units, usage: null };
    run.receipts.push(receipt);
    async function persistRun() {
      const { data, error } = await admin!.from("ai_jobs").update({ output: run as unknown as Json })
        .eq("id", job.id).eq("user_id", userId).eq("status", "processing").select("id").maybeSingle();
      if (error || !data) throw new Error("AnalysisReceiptUnavailable");
    }
    await persistRun();
    modelStarted = true;
    const onUsage = async (usage: NonNullable<typeof receipt.usage>) => { receipt.usage = usage; await persistRun(); };
    if (synthesis) run.report = await generateBookAnalysisReport(current.chapters, run.notes, onUsage);
    else { run.notes.push(...await generateBookAnalysisNotes(parts[step], onUsage)); run.completedParts += 1; }
    const latest = await manuscript(db, id, body.versionId, userId);
    if (latest.fingerprint !== current.fingerprint) throw new AnalysisError("The manuscript changed during analysis. Start again to review the current text.", 409);
    // A rejected transport may follow a committed write and a subsequent claim.
    // Once completion starts, preserve database state for read-only recovery.
    completionAttempted = true;
    const { data: completed, error: saveError } = await admin.from("ai_jobs").update({ status: synthesis ? "completed" : "pending",
      progress: Math.floor((run.completedParts + (synthesis ? 1 : 0)) / (parts.length + 1) * 100),
      output: run as unknown as Json, error: null, ...(synthesis ? { finished_at: new Date().toISOString() } : {}) })
      .eq("id", job.id).eq("user_id", userId).eq("status", "processing").select(columns).maybeSingle();
    if (saveError || !completed) throw new Error("AnalysisCompletionUnknown");
    ownedJob = null;
    return response({ analysis: result(completed as Job, current.fingerprint) });
  } catch (error) {
    if (reserved && !modelStarted) { try { await releaseBudget({ pipeline: "editorial", jobId: reservationId }); } catch { console.error("[book analysis] reservation release unavailable", { reservationId }); } }
    const uncertain = completionAttempted && ownedJob !== null;
    const budgetPaused = error instanceof BudgetExceededError && !modelStarted;
    const message = error instanceof BudgetExceededError ? "This analysis exceeds your remaining daily editorial AI allowance. Your completed parts are saved; continue this analysis after the daily reset."
      : error instanceof AnalysisError ? error.message : modelStarted ? "The AI could not complete this analysis. No complete report was produced; your manuscript has not changed." : "Analysis limits or receipt storage are unavailable. No AI work was started.";
    if (ownedJob && admin && !uncertain) {
      try { await admin.from("ai_jobs").update({ status: budgetPaused ? "pending" : "failed", error: message,
        ...(!budgetPaused ? { finished_at: new Date().toISOString() } : {}), output: run as unknown as Json })
        .eq("id", ownedJob.id).eq("user_id", userId).eq("status", "processing")
        .eq("output->>completedParts", String(ownedJob.output && analysisRunSchema.parse(ownedJob.output).completedParts)); } catch { console.error("[book analysis] failure receipt unavailable", { jobId: ownedJob.id }); }
    }
    console.error("[book analysis] step failed", { jobId: ownedJob?.id, modelStarted, uncertain, errorType: error instanceof Error ? error.name : "unknown" });
    return response({ error: uncertain ? "The save response was interrupted. Refresh the analysis status before continuing; the step may already be saved." : message }, error instanceof BudgetExceededError ? 429 : error instanceof AnalysisError ? error.status : modelStarted ? 502 : 503);
  }
}
