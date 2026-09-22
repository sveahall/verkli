import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { createPerUserRateLimiter } from "@/lib/rate-limit";
import { isAiChatEnabled } from "@/lib/flags";
import { aiDisabledResponse } from "@/features/ai-team/settings/guard";
import { assistantToolSchema } from "@/lib/ai/agent-actions";
import { conversationInputSchema } from "@/features/ai-team/memory/contracts";
import { AiMemoryError, completeTurn, memoryErrorResponse, requireEditionScope, reserveTurn } from "@/features/ai-team/memory/server";
import { AgentBookError, loadAgentBook } from "@/lib/ai/agent-runtime/book-context";
import { AgentRunError, runAgent } from "@/lib/ai/agent-runtime/loop";
import { summarisePlan } from "@/lib/ai/agent-runtime/plan";
import {
  apiError, E_FORBIDDEN, E_GENERIC_ERROR, E_INVALID_JSON,
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
  try {
    const book = await loadAgentBook(supabase, parsedParams.data.id, user.id, body.data.versionId);

    // Saved conversations work exactly as they do for advice: the same reserve
    // and complete calls, so turning a specialist agentic does not quietly cost
    // the author their history.
    let threadId: string | null = null;
    if (conversation && !conversation.temporary) {
      await requireEditionScope(supabase, book.bookId, conversation.editionId ?? null);
      const reservation = await reserveTurn(supabase, {
        bookId: book.bookId, editionId: conversation.editionId ?? null, tool: body.data.tool,
        threadId: conversation.threadId, requestId: conversation.requestId, message: body.data.message,
      });
      threadId = reservation.threadId;
      // A replayed request must not run the model, and must not produce a second
      // plan for a turn the author has already been shown.
      if (reservation.status === "completed") {
        return NextResponse.json({
          planId: null, summary: reservation.content ?? "", plan: null, stats: null,
          stoppedBecause: "finished", threadId, source: "history",
        }, { headers: { "Cache-Control": "private, no-store" } });
      }
    }

    const result = await runAgent({ book, message: body.data.message, tool: body.data.tool });
    if (threadId && conversation) await completeTurn(supabase, threadId, conversation.requestId, result.summary);

    if (!result.plan.steps.length) {
      return NextResponse.json({
        planId: null, summary: result.summary, plan: null, stats: null,
        stoppedBecause: result.stoppedBecause, threadId, source: "llm",
      }, { headers: { "Cache-Control": "private, no-store" } });
    }

    // Stored with the service role: the browser gets a copy to render and an id
    // to approve, never the ability to put steps into this table itself.
    const admin = createAdminClient();
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

    return NextResponse.json({
      planId: stored.id,
      expiresAt: stored.expires_at,
      summary: result.summary,
      plan: result.plan,
      stats: summarisePlan(result.plan),
      stoppedBecause: result.stoppedBecause,
      threadId,
      source: "llm",
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
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
