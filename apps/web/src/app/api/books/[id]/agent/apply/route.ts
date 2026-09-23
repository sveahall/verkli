import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { createPerUserRateLimiter } from "@/lib/rate-limit";
import { isAiChatEnabled } from "@/lib/flags";
import { aiDisabledResponse } from "@/features/ai-team/settings/guard";
import { AgentBookError, loadAgentBook } from "@/lib/ai/agent-runtime/book-context";
import { planStepSchema, type Plan } from "@/lib/ai/agent-runtime/plan";
import { applyPlan, type StepOutcome } from "@/lib/ai/agent-runtime/apply";
import {
  apiError, E_FORBIDDEN, E_GENERIC_ERROR, E_INVALID_JSON,
  E_INVALID_REQUEST_BODY, E_RATE_LIMIT_EXCEEDED, E_VALIDATION_FAILED,
} from "@/lib/api-errors";

export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.string().uuid() });

/**
 * The approval names a stored plan and, optionally, which parts of it the author
 * kept. It cannot carry steps: those live in the row this id points at.
 */
const bodySchema = z.object({
  planId: z.string().uuid(),
  stepIds: z.array(z.string().max(16)).max(64).optional(),
  matchIds: z.array(z.string().max(16)).max(2000).optional(),
}).strict();

const applyLimiter = createPerUserRateLimiter({ name: "books-agent-apply", maxPerMinute: 12 });

const storedOutcomeSchema = z.array(z.object({
  stepId: z.string().min(1).max(16),
  status: z.enum(["applied", "skipped", "deferred", "failed"]),
  detail: z.string().max(2000),
  changed: z.number().int().nonnegative().optional(),
}).passthrough()).max(64);

/** A repeat apply should show the write that already happened, when we still have it. */
function alreadyAppliedBody(outcome: unknown) {
  const parsed = storedOutcomeSchema.safeParse(outcome);
  if (!parsed.success) {
    return { error: E_GENERIC_ERROR, message: "This plan has already been applied." };
  }
  const changed = parsed.data.reduce((total, item) => total + (item.changed ?? 0), 0);
  return { error: E_GENERIC_ERROR, message: "This plan has already been applied.", changed, outcomes: parsed.data };
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

  const limit = await applyLimiter.check(user.id);
  if (!limit.allowed) return apiError(E_RATE_LIMIT_EXCEEDED, 429);

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return apiError(E_INVALID_JSON, 400);
  }
  const body = bodySchema.safeParse(rawBody);
  if (!body.success) return apiError(E_INVALID_REQUEST_BODY, 400);

  const admin = createAdminClient();
  const { data: row, error: loadError } = await admin
    .from("agent_plans")
    .select("id, owner_id, book_id, version_id, steps, applied_at, expires_at, outcome")
    .eq("id", body.data.planId)
    .maybeSingle();

  if (loadError) {
    console.error("[agent.apply] plan lookup failed", { code: loadError.code });
    return apiError(E_GENERIC_ERROR, 503);
  }
  // One answer for "no such plan" and "not yours": a plan id must not be a way
  // to learn that someone else's plan exists.
  if (!row || row.owner_id !== user.id || row.book_id !== parsedParams.data.id) return apiError(E_FORBIDDEN, 404);
  if (row.applied_at) {
    return NextResponse.json(alreadyAppliedBody(row.outcome), { status: 409 });
  }
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({
      error: E_GENERIC_ERROR,
      message: "This plan is too old to apply safely — your chapters may have changed since. Ask for a fresh one.",
    }, { status: 410 });
  }

  const steps = z.array(planStepSchema).safeParse(row.steps);
  if (!steps.success) {
    console.error("[agent.apply] stored plan failed validation", { planId: row.id });
    return apiError(E_GENERIC_ERROR, 422);
  }

  // Claim before doing anything. A double submit loses the race here rather
  // than applying forty-seven replacements twice.
  const { data: claimed, error: claimError } = await admin
    .from("agent_plans")
    .update({ applied_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("applied_at", null)
    .select("id");
  if (claimError || !claimed?.length) {
    return NextResponse.json({ error: E_GENERIC_ERROR, message: "This plan has already been applied." }, { status: 409 });
  }

  // Stays null until applyPlan returns. A throw before that is either a load
  // failure or a chapter write that stopped halfway. A chapter that did land
  // now has a new hash, so a retry skips it, and cover saves cannot have run
  // yet — they happen after the chapter loop and catch their own errors.
  // Holding the claim would turn the retry into a 409 the panel treats as done.
  let outcomes: StepOutcome[] | null = null;
  try {
    const supabase = await createClient();
    const book = await loadAgentBook(supabase, parsedParams.data.id, user.id, row.version_id);
    const plan: Plan = { versionId: row.version_id, steps: steps.data };
    outcomes = await applyPlan(supabase, book, plan, {
      stepIds: body.data.stepIds,
      matchIds: body.data.matchIds,
    });

    const changed = outcomes.reduce((total, outcome) => total + (outcome.changed ?? 0), 0);
    const { error: outcomeError } = await admin.from("agent_plans").update({ outcome: outcomes }).eq("id", row.id);
    if (outcomeError) console.error("[agent.apply] outcome save failed", { code: outcomeError.code });
    const { error: auditError } = await admin.from("audit_log").insert({
      actor_user_id: user.id,
      action: "agent_plan.applied",
      entity_type: "book",
      entity_id: book.bookId,
      meta: { planId: row.id, versionId: book.versionId, changed, outcomes },
    });
    if (auditError) console.error("[agent.apply] audit failed", { code: auditError.code });

    return NextResponse.json({ planId: row.id, changed, outcomes }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (!outcomes) {
      // agent_plans_immutable allows this only while outcome is still null.
      // A claim that already recorded a result cannot be opened again.
      const { error: releaseError } = await admin.from("agent_plans").update({ applied_at: null }).eq("id", row.id);
      if (releaseError) console.error("[agent.apply] could not release the claim", { code: releaseError.code });
    }
    if (error instanceof AgentBookError) {
      return NextResponse.json({ error: E_GENERIC_ERROR, message: error.message }, { status: error.status });
    }
    console.error("[agent.apply] failed", { reason: error instanceof Error ? error.message : "unknown" });
    return apiError(E_GENERIC_ERROR, 500);
  }
}
