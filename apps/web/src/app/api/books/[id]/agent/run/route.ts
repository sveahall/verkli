import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { createPerUserRateLimiter } from "@/lib/rate-limit";
import { isAiChatEnabled } from "@/lib/flags";
import { aiDisabledResponse } from "@/features/ai-team/settings/guard";
import { BudgetConfigurationError, BudgetExceededError, checkBudget, releaseBudget } from "@/lib/workers/budget";
import { estimateAgentRunUnits, reconcileAgentRunUnits } from "@/lib/ai/agent-runtime/budget";
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
const STOPPED_BECAUSE = ["finished", "turn_limit", "token_ceiling"] as const;
type StoppedBecause = typeof STOPPED_BECAUSE[number];

function asStoppedBecause(value: unknown): StoppedBecause {
  return (STOPPED_BECAUSE as readonly string[]).includes(String(value)) ? value as StoppedBecause : "finished";
}

/**
 * A lost response must not cost a second model run. The plan is stored under
 * this request id, so a replay cannot pick up a different plan that happens
 * to share the summary.
 */
async function replayablePlan(
  admin: ReturnType<typeof createAdminClient>,
  ownerId: string,
  bookId: string,
  requestId: string,
) {
  const { data, error } = await admin
    .from("agent_plans")
    .select("id, steps, summary, expires_at, version_id, stopped_because")
    .eq("owner_id", ownerId)
    .eq("book_id", bookId)
    .eq("request_id", requestId)
    .is("applied_at", null)
    .gt("expires_at", new Date().toISOString())
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
    stoppedBecause: asStoppedBecause(row.stopped_because),
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
  /**
   * Stable across a replay of the same request, which is the case this route
   * exists to handle: a client that loses the response retries with the same
   * requestId, reserveTurn returns the stored reply without calling the model,
   * and a fresh uuid here charged the full estimate again for a run that never
   * happened. Two such replays on a large book locked the author out of the
   * agent for the rest of the UTC day. The idempotent reservation marker in
   * workers/budget was built for exactly this and was being handed a new key
   * every time.
   *
   * Only when the conversation is persisted, because only then does reserveTurn
   * refuse a repeated requestId. A temporary conversation has no such guard, so
   * a client could otherwise reuse one id and run the model for free.
   */
  const replayable = body.data.conversation && !body.data.conversation.temporary;
  const budgetJobId = replayable ? `request:${body.data.conversation!.requestId}` : randomUUID();
  let reserved = false;
  let modelStarted = false;
  try {
    const book = await loadAgentBook(supabase, parsedParams.data.id, user.id, body.data.versionId);

    const chapterChars = book.chapters.reduce((total, chapter) => total + (chapter.doc?.content.size ?? 0), 0);
    const reservedUnits = estimateAgentRunUnits(chapterChars);
    await checkBudget({ userId: user.id, pipeline: "agent", jobId: budgetJobId, units: reservedUnits });
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
        const existing = await replayablePlan(admin, user.id, book.bookId, conversation.requestId);
        if (existing) return NextResponse.json({ ...existing, threadId }, noStore);
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
    // The reservation is an opening position taken before anything is known.
    // Charging only that would make the daily ceiling a guess: a search for a
    // common substring fills the conversation and is re-sent every turn, so a
    // run can cost several times what its book's size suggested. A refused
    // overrun is not recorded, but by then the key is already at its limit, so
    // the next run is stopped either way.
    const overrun = reconcileAgentRunUnits(reservedUnits, result.usage);
    if (overrun > 0) {
      await checkBudget({
        userId: user.id, pipeline: "agent", jobId: `${budgetJobId}:overrun`, units: overrun,
      }).catch((error: unknown) => {
        console.warn("[agent.run] overrun could not be charged", {
          overrun, reason: error instanceof Error ? error.name : "unknown",
        });
      });
    }

    console.info("[agent.run] finished", {
      bookId: book.bookId,
      tool: body.data.tool,
      chapters: book.chapters.length,
      turns: result.turns,
      steps: result.plan.steps.length,
      stoppedBecause: result.stoppedBecause,
      reservedUnits,
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
        stopped_because: result.stoppedBecause,
        request_id: conversation?.requestId ?? null,
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
