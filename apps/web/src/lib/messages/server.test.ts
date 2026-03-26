import { describe, expect, it, vi } from "vitest";
import {
  toConversationPair,
  getOtherParticipantId,
  isConversationParticipant,
  canSendInConversation,
  resolveNewConversationStatus,
  type ConversationRow,
} from "./server";

// ── Pure function tests (no mocks needed) ───────────────────────────

describe("toConversationPair", () => {
  it("orders participants deterministically (a < b)", () => {
    const result = toConversationPair("aaa", "bbb");
    expect(result).toEqual({ participantOneId: "aaa", participantTwoId: "bbb" });
  });

  it("orders participants deterministically (b < a)", () => {
    const result = toConversationPair("zzz", "aaa");
    expect(result).toEqual({ participantOneId: "aaa", participantTwoId: "zzz" });
  });

  it("produces consistent order regardless of argument order", () => {
    const a = toConversationPair("user-a", "user-b");
    const b = toConversationPair("user-b", "user-a");
    expect(a).toEqual(b);
  });

  it("handles identical user ids", () => {
    const result = toConversationPair("same", "same");
    expect(result.participantOneId).toBe("same");
    expect(result.participantTwoId).toBe("same");
  });
});

describe("getOtherParticipantId", () => {
  const conversation = {
    id: "conv-1",
    participant_one_id: "alice",
    participant_two_id: "bob",
    requester_id: "alice",
    status: "accepted" as const,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    last_message_at: null,
  } satisfies ConversationRow;

  it("returns participant_two when current is participant_one", () => {
    expect(getOtherParticipantId(conversation, "alice")).toBe("bob");
  });

  it("returns participant_one when current is participant_two", () => {
    expect(getOtherParticipantId(conversation, "bob")).toBe("alice");
  });
});

describe("isConversationParticipant", () => {
  const conversation = {
    id: "conv-1",
    participant_one_id: "alice",
    participant_two_id: "bob",
    requester_id: "alice",
    status: "accepted" as const,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    last_message_at: null,
  } satisfies ConversationRow;

  it("returns true for participant_one", () => {
    expect(isConversationParticipant(conversation, "alice")).toBe(true);
  });

  it("returns true for participant_two", () => {
    expect(isConversationParticipant(conversation, "bob")).toBe(true);
  });

  it("returns false for non-participant", () => {
    expect(isConversationParticipant(conversation, "eve")).toBe(false);
  });
});

describe("canSendInConversation", () => {
  it("allows both parties in accepted conversations", () => {
    const conv = { status: "accepted" as const, requester_id: "alice" };
    expect(canSendInConversation(conv, "alice")).toBe(true);
    expect(canSendInConversation(conv, "bob")).toBe(true);
  });

  it("blocks both parties in blocked conversations", () => {
    const conv = { status: "blocked" as const, requester_id: "alice" };
    expect(canSendInConversation(conv, "alice")).toBe(false);
    expect(canSendInConversation(conv, "bob")).toBe(false);
  });

  it("allows requester in pending request conversations", () => {
    const conv = { status: "request" as const, requester_id: "alice" };
    expect(canSendInConversation(conv, "alice")).toBe(true);
  });

  it("blocks non-requester in pending request conversations", () => {
    const conv = { status: "request" as const, requester_id: "alice" };
    expect(canSendInConversation(conv, "bob")).toBe(false);
  });
});

describe("resolveNewConversationStatus", () => {
  it("creates request when reader messages author", () => {
    expect(resolveNewConversationStatus("reader", "author")).toBe("request");
  });

  it("auto-accepts when author messages reader", () => {
    expect(resolveNewConversationStatus("author", "reader")).toBe("accepted");
  });

  it("auto-accepts when author messages author", () => {
    expect(resolveNewConversationStatus("author", "author")).toBe("accepted");
  });

  it("auto-accepts when reader messages reader", () => {
    expect(resolveNewConversationStatus("reader", "reader")).toBe("accepted");
  });
});

// ── Async functions with mocked Supabase admin ──────────────────────

function mockAdmin(overrides: Record<string, unknown> = {}) {
  const defaultChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    order: vi.fn().mockReturnThis(),
  };

  return {
    from: vi.fn().mockReturnValue({ ...defaultChain, ...overrides }),
    rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
  };
}

describe("consumeMessageRateLimit", () => {
  // Dynamic import to allow mock setup
  it("calls dm_consume_rate_limit RPC with defaults", async () => {
    const { consumeMessageRateLimit } = await import("./server");
    const admin = mockAdmin();

    const allowed = await consumeMessageRateLimit(admin as never, "user-1");

    expect(allowed).toBe(true);
    expect(admin.rpc).toHaveBeenCalledWith("dm_consume_rate_limit", {
      p_sender_id: "user-1",
      p_max: 12,
      p_window_seconds: 60,
    });
  });

  it("respects custom max and window", async () => {
    const { consumeMessageRateLimit } = await import("./server");
    const admin = mockAdmin();

    await consumeMessageRateLimit(admin as never, "user-1", {
      maxMessages: 5,
      windowSeconds: 30,
    });

    expect(admin.rpc).toHaveBeenCalledWith("dm_consume_rate_limit", {
      p_sender_id: "user-1",
      p_max: 5,
      p_window_seconds: 30,
    });
  });

  it("returns false when rate limit is exceeded", async () => {
    const { consumeMessageRateLimit } = await import("./server");
    const admin = mockAdmin();
    admin.rpc.mockResolvedValue({ data: false, error: null });

    const allowed = await consumeMessageRateLimit(admin as never, "user-1");

    expect(allowed).toBe(false);
  });

  it("throws when RPC fails", async () => {
    const { consumeMessageRateLimit } = await import("./server");
    const admin = mockAdmin();
    admin.rpc.mockResolvedValue({ data: null, error: { message: "RPC failed" } });

    await expect(
      consumeMessageRateLimit(admin as never, "user-1")
    ).rejects.toThrow("Rate limit RPC failed");
  });
});

describe("getMessagingRolesForUsers", () => {
  it("returns reader for unknown users", async () => {
    const { getMessagingRolesForUsers } = await import("./server");
    const admin = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    };

    const roles = await getMessagingRolesForUsers(admin as never, ["unknown-user"]);

    expect(roles.get("unknown-user")).toBe("reader");
  });

  it("returns empty map for empty input", async () => {
    const { getMessagingRolesForUsers } = await import("./server");
    const admin = { from: vi.fn() };

    const roles = await getMessagingRolesForUsers(admin as never, []);

    expect(roles.size).toBe(0);
    expect(admin.from).not.toHaveBeenCalled();
  });
});

describe("isBlockedBetweenUsers", () => {
  it("returns not blocked when no block rows", async () => {
    const { isBlockedBetweenUsers } = await import("./server");
    const admin = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
      }),
    };

    const result = await isBlockedBetweenUsers(admin as never, "alice", "bob");

    expect(result).toEqual({ blocked: false, blockedBy: null });
  });
});
