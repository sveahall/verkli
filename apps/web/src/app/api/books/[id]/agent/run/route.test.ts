import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  gate: vi.fn(),
  enabled: vi.fn(),
  check: vi.fn(),
  load: vi.fn(),
  run: vi.fn(),
  reserve: vi.fn(),
  complete: vi.fn(),
  scope: vi.fn(),
  events: [] as string[],
  inserted: [] as Record<string, unknown>[],
  insertError: null as { code: string; message: string } | null,
  storedPlans: [] as Record<string, unknown>[],
  budget: vi.fn(),
  release: vi.fn(),
}));

vi.mock("@/lib/auth/require-author", () => ({ requireAuthorRoleForApi: mocks.gate }));
vi.mock("@/lib/flags", () => ({ isAiChatEnabled: mocks.enabled }));
vi.mock("@/features/ai-team/settings/guard", () => ({ aiDisabledResponse: async () => null }));
// Declared inside the factory: vi.mock is hoisted above any class in the file.
vi.mock("@/lib/workers/budget", () => ({
  checkBudget: mocks.budget,
  releaseBudget: mocks.release,
  BudgetExceededError: class BudgetExceededError extends Error {},
  BudgetConfigurationError: class BudgetConfigurationError extends Error {},
}));
vi.mock("@/lib/rate-limit", () => ({ createPerUserRateLimiter: () => ({ check: mocks.check }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/ai/agent-runtime/book-context", () => ({
  loadAgentBook: mocks.load,
  AgentBookError: class AgentBookError extends Error { status = 503; },
}));
vi.mock("@/lib/ai/agent-runtime/loop", () => ({
  runAgent: mocks.run,
  AgentRunError: class AgentRunError extends Error { code = "PROVIDER_FAILED"; },
}));
vi.mock("@/features/ai-team/memory/server", () => ({
  reserveTurn: mocks.reserve,
  completeTurn: mocks.complete,
  requireEditionScope: mocks.scope,
  memoryErrorResponse: (error: { message?: string; status?: number }) =>
    Response.json({ message: error.message }, { status: error.status ?? 503 }),
  AiMemoryError: class AiMemoryError extends Error {
    constructor(readonly code: string, readonly status: number, message: string) { super(message); }
  },
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        mocks.events.push("insert");
        mocks.inserted.push(row);
        return {
          select: () => ({
            single: async () => mocks.insertError
              ? { data: null, error: mocks.insertError }
              : { data: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", expires_at: "2099-01-01T00:00:00.000Z" }, error: null },
          }),
        };
      },
      select: () => {
        const chain = {
          eq: () => chain,
          is: () => chain,
          gt: () => chain,
          order: () => chain,
          limit: async () => {
            mocks.events.push("lookup");
            return { data: mocks.storedPlans, error: null };
          },
        };
        return chain;
      },
    }),
  }),
}));

import { BudgetExceededError } from "@/lib/workers/budget";
import { POST } from "./route";

const bookId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const versionId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const requestId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const threadId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const step = { id: "s1", tool: "set_cover_text", reason: "Subtitle.", fields: { subtitle: "A harbour story" } };
const summary = "The subtitle becomes A harbour story.";

function run() {
  return POST(
    new NextRequest(`http://localhost/api/books/${bookId}/agent/run`, {
      method: "POST",
      body: JSON.stringify({
        message: "Set the subtitle",
        tool: "edit",
        versionId,
        conversation: { threadId, requestId, editionId: versionId, temporary: false },
      }),
    }),
    { params: Promise.resolve({ id: bookId }) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.events = [];
  mocks.inserted = [];
  mocks.budget.mockResolvedValue({ current: 0, limit: 100_000 });
  mocks.insertError = null;
  mocks.storedPlans = [];
  mocks.gate.mockResolvedValue({ user: { id: "author" } });
  mocks.enabled.mockReturnValue(true);
  mocks.check.mockResolvedValue({ allowed: true });
  mocks.scope.mockResolvedValue(undefined);
  mocks.load.mockResolvedValue({ bookId, versionId, bookTitle: "Harbour", chapters: [] });
  mocks.reserve.mockImplementation(async () => {
    mocks.events.push("reserve");
    return { status: "reserved", threadId, replyId: requestId };
  });
  mocks.run.mockImplementation(async () => {
    mocks.events.push("run");
    return {
      summary, plan: { versionId, steps: [step] }, turns: 2, stoppedBecause: "finished",
      usage: { inputTokens: 10, outputTokens: 4 },
    };
  });
  mocks.complete.mockImplementation(async () => {
    mocks.events.push("complete");
    return true;
  });
});

describe("agent run plan storage", () => {
  it("stores the plan before marking the turn complete", async () => {
    const response = await run();

    expect(response.status).toBe(200);
    expect(mocks.events).toEqual(["reserve", "run", "insert", "complete"]);
    expect(mocks.inserted[0]).toMatchObject({ owner_id: "author", summary, steps: [step] });
    expect(await response.json()).toMatchObject({
      planId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      summary,
      source: "llm",
    });
  });

  it("does not mark the turn complete when the plan cannot be stored", async () => {
    mocks.insertError = { code: "23503", message: "insert failed" };

    const response = await run();

    expect(response.status).toBe(503);
    expect(mocks.events).toEqual(["reserve", "run", "insert"]);
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it("returns the stored plan when the same request is replayed", async () => {
    mocks.reserve.mockResolvedValue({ status: "completed", threadId, replyId: requestId, content: summary });
    mocks.storedPlans = [{
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      steps: [step],
      summary,
      expires_at: "2099-01-01T00:00:00.000Z",
      version_id: versionId,
    }];

    const response = await run();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.planId).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(body.plan.steps).toEqual([step]);
    expect(body.source).toBe("llm");
    expect(mocks.run).not.toHaveBeenCalled();
    expect(mocks.events).toEqual(["lookup"]);
  });

  it("returns history without a plan when the replay has nothing left to approve", async () => {
    mocks.reserve.mockResolvedValue({ status: "completed", threadId, replyId: requestId, content: summary });

    const response = await run();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ planId: null, summary, source: "history", plan: null });
    expect(mocks.run).not.toHaveBeenCalled();
  });
});

describe("agent run spending", () => {
  it("refuses before the model is called when the allowance is gone", async () => {
    mocks.budget.mockRejectedValue(new BudgetExceededError({
      userId: "author", pipeline: "editorial", day: "2026-09-22",
      key: "budget:editorial:author:2026-09-22", current: 90_000, limit: 90_000, jobId: null,
    }));

    const response = await run();
    expect(response.status).toBe(429);
    // The point of reserving first: a refused run costs nothing.
    expect(mocks.run).not.toHaveBeenCalled();
    expect(mocks.events).toEqual([]);
  });

  it("gives the allowance back when nothing reached the model", async () => {
    mocks.reserve.mockRejectedValue(new Error("conversation unavailable"));

    await run();
    expect(mocks.run).not.toHaveBeenCalled();
    expect(mocks.release).toHaveBeenCalledTimes(1);
  });

  it("keeps the reservation once the model has been called, even on failure", async () => {
    mocks.run.mockRejectedValue(new Error("provider exploded"));

    await run();
    // A failed call can still have been billed. Refunding it would make the
    // daily ceiling a suggestion.
    expect(mocks.release).not.toHaveBeenCalled();
  });
});

