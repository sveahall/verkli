import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  gate: vi.fn(),
  enabled: vi.fn(),
  check: vi.fn(),
  load: vi.fn(),
  apply: vi.fn(),
  updates: [] as Record<string, unknown>[],
  inserts: [] as Record<string, unknown>[],
  plan: null as Record<string, unknown> | null,
  insertError: null as { code: string } | null,
}));

vi.mock("@/lib/auth/require-author", () => ({ requireAuthorRoleForApi: mocks.gate }));
vi.mock("@/lib/flags", () => ({ isAiChatEnabled: mocks.enabled }));
vi.mock("@/features/ai-team/settings/guard", () => ({ aiDisabledResponse: async () => null }));
vi.mock("@/lib/rate-limit", () => ({ createPerUserRateLimiter: () => ({ check: mocks.check }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/ai/agent-runtime/book-context", () => ({
  loadAgentBook: mocks.load,
  AgentBookError: class AgentBookError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.name = "AgentBookError";
      this.status = status;
    }
  },
}));
vi.mock("@/lib/ai/agent-runtime/apply", () => ({ applyPlan: mocks.apply }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: mocks.plan, error: null }) }),
      }),
      update: (patch: Record<string, unknown>) => {
        mocks.updates.push(patch);
        const claimed = { data: [{ id: "plan" }], error: null };
        const chain = {
          eq: () => chain,
          is: () => chain,
          select: () => Promise.resolve(claimed),
          then: (resolve: (value: { data: null; error: null }) => unknown, reject?: (reason: unknown) => unknown) =>
            Promise.resolve({ data: null, error: null }).then(resolve, reject),
        };
        return chain;
      },
      insert: (row: Record<string, unknown>) => {
        mocks.inserts.push(row);
        return Promise.resolve({ error: mocks.insertError });
      },
    }),
  }),
}));

import { POST } from "./route";
import { AgentBookError } from "@/lib/ai/agent-runtime/book-context";

const bookId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const planId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const versionId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const step = { id: "s1", tool: "set_cover_text", reason: "Subtitle.", fields: { subtitle: "A harbour story" } };

function plan(overrides: Record<string, unknown> = {}) {
  return {
    id: planId,
    owner_id: "author",
    book_id: bookId,
    version_id: versionId,
    steps: [step],
    applied_at: null,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    outcome: null,
    ...overrides,
  };
}

function run() {
  return POST(
    new NextRequest(`http://localhost/api/books/${bookId}/agent/apply`, {
      method: "POST",
      body: JSON.stringify({ planId }),
    }),
    { params: Promise.resolve({ id: bookId }) },
  );
}

beforeEach(() => {
  mocks.updates = [];
  mocks.inserts = [];
  mocks.insertError = null;
  mocks.plan = plan();
  mocks.gate.mockResolvedValue({ user: { id: "author" } });
  mocks.enabled.mockReturnValue(true);
  mocks.check.mockResolvedValue({ allowed: true });
  mocks.load.mockResolvedValue({ bookId, versionId, bookTitle: "Harbour", chapters: [] });
  mocks.apply.mockResolvedValue([{ stepId: "s1", tool: "set_cover_text", status: "applied", detail: "Saved to your cover." }]);
});

describe("agent apply claim", () => {
  it("returns the stored write when the plan was already applied", async () => {
    const outcomes = [{ stepId: "s1", tool: "set_cover_text", status: "applied", detail: "Saved to your cover." }];
    mocks.plan = plan({ applied_at: new Date().toISOString(), outcome: outcomes });

    const response = await run();

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ message: "This plan has already been applied.", changed: 0, outcomes });
    expect(mocks.apply).not.toHaveBeenCalled();
    expect(mocks.updates).toEqual([]);
  });

  it("drops an unreadable stored outcome instead of inventing a result", async () => {
    mocks.plan = plan({ applied_at: new Date().toISOString(), outcome: { nope: true } });

    const response = await run();
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.message).toBe("This plan has already been applied.");
    expect(body).not.toHaveProperty("outcomes");
  });

  it("releases the claim when the edition cannot be loaded, so a retry can write", async () => {
    mocks.load.mockRejectedValue(new AgentBookError("Could not load this edition. Try again.", 503));

    const response = await run();

    expect(response.status).toBe(503);
    expect(mocks.apply).not.toHaveBeenCalled();
    expect(mocks.updates.map((patch) => "applied_at" in patch ? patch.applied_at : "other")).toEqual([
      expect.any(String),
      null,
    ]);
  });

  it("keeps the claim and answers 200 when the write landed and only the audit failed", async () => {
    mocks.insertError = { code: "23503" };

    const response = await run();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ planId, changed: 0 });
    expect(mocks.updates.some((patch) => patch.applied_at === null)).toBe(false);
    expect(mocks.updates.some((patch) => Array.isArray(patch.outcome))).toBe(true);
  });
});
