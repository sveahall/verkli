import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { createPerUserRateLimiter } from "@/lib/rate-limit";
import { isAiChatEnabled } from "@/lib/flags";
import { aiDisabledResponse } from "@/features/ai-team/settings/guard";
import { BudgetConfigurationError, BudgetExceededError, checkBudget, releaseBudget } from "@/lib/workers/budget";
import { estimateAgentRunUnits } from "@/lib/ai/agent-runtime/budget";
import { randomUUID } from "node:crypto";
import { assistantToolSchema } from "@/lib/ai/agent-actions";
import { conversationInputSchema } from "@/features/ai-team/memory/contracts";
import { AiMemoryError, completeTurn, memoryErrorResponse, requireEditionScope, reserveTurn } from "@/features/ai-team/memory/server";
import { AgentBookError, loadAgentBook } from "@/lib/ai/agent-runtime/book-context";
import { AgentRunError, runAgent } from "@/lib/ai/agent-runtime/loop";
import { planStepSchema, summarisePlan, type Plan } from "@/lib/ai/agent-runtime/plan";
import {
  apiError, E_AI_BUDGET_EXCEEDED, E_FORBIDDEN, E_GENERIC_ERROR, E_INVALID_JSON,
  E_INVALID_REQUEST_BODY, E_RATE_LIMIT_EXCEEDED, E_VALIDATION_FAILED,
} from "@/lib/api-errors";

export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.string().uuid() });

const bodySchema = z.object({
  message: z.string().trim().min(1).max(4000),
  tool: assistantToolSchema.default("edit"),
  versionId: z.string().uuid().optional().nullable(),
  conversation: conversationInputSchema.optional(),
}).strict();

/**
 * Far tighter than the chat limiter. One run can search a whole manuscript and
 * spend eight model turns doing it, so the ceiling is per run, not per message.
 * The name is its own — limiters that share a name share a Redis budget.
 */
const runLimiter = createPerUserRateLimiter({ name: "books-agent-run", maxPerMinute: 6 });
const noStore = { headers: { "Cache-Control": "private, no-store" } };

/**
 * A lost response must not cost a second model run. The saved reply holds the
 * summary and the plan row holds the steps; they were written together, so the
 * newest unapplied plan with that summary is the one this request already paid for.
 */
async function replayablePlan(
  admin: ReturnType<typeof createAdminClient>,
  ownerId: string,
  bookId: string,
  versionId: string,
  tool: string,
  summary: string,
) {
  const { data, error } = await admin
    .from("agent_plans")
    .select("id, steps, summary, expires_at, version_id")
    .eq("owner_id", ownerId)
    .eq("book_id", bookId)
    .eq("version_id", versionId)
    .eq("tool", tool)
    .eq("summary", summary)
    .is("applied_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1);
  const row = data?.[0];
  if (error || !row) return null;
  const steps = z.array(planStepSchema).safeParse(row.steps);
  if (!steps.success) return null;
  const plan: Plan = { versionId: row.version_id, steps: steps.data };
  return {
    planId: row.id,
    expiresAt: row.expires_at,
    summary: row.summary,
    plan,
    stats: summarisePlan(plan),
    source: "llm" as const,
  };
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAiChatEnabled()) return apiError(E_FORBIDDEN, 403);

  const gate = await requireAuthorRoleForApi();
  if (gate.response) return gate.response;
  const user = gate.user;

  const aiOff = await aiDisabledResponse(user.id);
  if (aiOff) return aiOff;

  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) return apiError(E_VALIDATION_FAILED, 400);

  const limit = await runLimiter.check(user.id);
  if (!limit.allowed) return apiError(E_RATE_LIMIT_EXCEEDED, 429);

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return apiError(E_INVALID_JSON, 400);
  }
  const body = bodySchema.safeParse(rawBody);
  if (!body.success) return apiError(E_INVALID_REQUEST_BODY, 400);

  const supabase = await createClient();
  const conversation = body.data.conversation;
  // Its own pipeline, with a working default rather than a required variable:
  // EDITORIAL_DAILY_BUDGET is declared in no env file and set nowhere, which is
  // why the editorial review route already fails closed in every environment.
  const budgetJobId = randomUUID();
  let reserved = false;
  let modelStarted = false;
  try {
    const book = await loadAgentBook(supabase, parsedParams.data.id, user.id, body.data.versionId);

    const chapterChars = book.chapters.reduce((total, chapter) => total + (chapter.doc?.content.size ?? 0), 0);
    await checkBudget({
      userId: user.id, pipeline: "agent", jobId: budgetJobId,
      units: estimateAgentRunUnits(chapterChars),
    });
    reserved = true;

    // Saved conversations work exactly as they do for advice: the same reserve
    // and complete calls, so turning a specialist agentic does not quietly cost
    // the author their history.
    const admin = createAdminClient();
    let threadId: string | null = null;
    if (conversation && !conversation.temporary) {
      await requireEditionScope(supabase, book.bookId, conversation.editionId ?? null);
      const reservation = await reserveTurn(supabase, {
        bookId: book.bookId, editionId: conversation.editionId ?? null, tool: body.data.tool,
        threadId: conversation.threadId, requestId: conversation.requestId, message: body.data.message,
      });
      threadId = reservation.threadId;
      // A replayed request must not run the model again. If the plan was stored
      // and the response was lost, hand that same plan back so the author can
      // still approve it.
      if (reservation.status === "completed") {
        const existing = reservation.content
          ? await replayablePlan(admin, user.id, book.bookId, book.versionId, body.data.tool, reservation.content)
          : null;
        if (existing) return NextResponse.json({ ...existing, stoppedBecause: "finished", threadId }, noStore);
        return NextResponse.json({
          planId: null, summary: reservation.content ?? "", plan: null, stats: null,
          stoppedBecause: "finished", threadId, source: "history",
        }, noStore);
      }
    }

    modelStarted = true;
    const result = await runAgent({ book, message: body.data.message, tool: body.data.tool });

    // The one place a run's real cost is visible. A book-wide search re-sends
    // the conversation every turn, so input tokens compound in a way a single
    // chat reply never does, and until the per-user usage ledger on
    // feat/usage-metering lands and this call can take a `meter` context, a log
    // line is the only thing standing between that and an invisible bill.
    console.info("[agent.run] finished", {
      bookId: book.bookId,
      tool: body.data.tool,
      chapters: book.chapters.length,
      turns: result.turns,
      steps: result.plan.steps.length,
      stoppedBecause: result.stoppedBecause,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
    });

    if (!result.plan.steps.length) {
      if (threadId && conversation) await completeTurn(supabase, threadId, conversation.requestId, result.summary);
      return NextResponse.json({
        planId: null, summary: result.summary, plan: null, stats: null,
        stoppedBecause: result.stoppedBecause, threadId, source: "llm",
      }, noStore);
    }

    // Stored with the service role before the turn is marked complete. Completing
    // first meant a failed insert left a saved reply with no plan, and the retry
    // was forbidden from running the model again.
    const { data: stored, error } = await admin
      .from("agent_plans")
      .insert({
        owner_id: user.id,
        book_id: book.bookId,
        version_id: book.versionId,
        tool: body.data.tool,
        summary: result.summary,
        steps: result.plan.steps,
      })
      .select("id, expires_at")
      .single();

    if (error || !stored) {
      console.error("[agent.run] plan could not be stored", { code: error?.code, message: error?.message });
      return apiError(E_GENERIC_ERROR, 503);
    }

    if (threadId && conversation) await completeTurn(supabase, threadId, conversation.requestId, result.summary);

    return NextResponse.json({
      planId: stored.id,
      expiresAt: stored.expires_at,
      summary: result.summary,
      plan: result.plan,
      stats: summarisePlan(result.plan),
      stoppedBecause: result.stoppedBecause,
      threadId,
      source: "llm",
    }, noStore);
  } catch (error) {
    if (error instanceof BudgetExceededError) {
      return NextResponse.json({
        error: E_AI_BUDGET_EXCEEDED,
        message: "This would go past your remaining daily AI allowance. Try again after the daily reset.",
      }, { status: 429 });
    }
    if (error instanceof BudgetConfigurationError) {
      console.error("[agent.run] budget is not configured", { message: error.message });
      return apiError(E_GENERIC_ERROR, 503);
    }
    // A model call that failed can still have been billed, so a reservation is
    // released only when nothing reached the model at all.
    if (reserved && !modelStarted) await releaseBudget({ pipeline: "agent", jobId: budgetJobId });
    // Only for genuine memory errors: memoryErrorResponse turns anything it is
    // handed into a 503 about saved conversations, which would mislabel every
    // other failure below it.
    if (error instanceof AiMemoryError) return memoryErrorResponse(error);
    if (error instanceof AgentBookError) {
      return NextResponse.json({ error: E_GENERIC_ERROR, message: error.message }, { status: error.status });
    }
    if (error instanceof AgentRunError) {
      console.warn("[agent.run] provider failed", { code: error.code });
      return apiError(E_GENERIC_ERROR, error.code === "PROVIDER_TIMEOUT" ? 504 : 503);
    }
    console.error("[agent.run] failed", { reason: error instanceof Error ? error.message : "unknown" });
    return apiError(E_GENERIC_ERROR, 500);
  }
}
