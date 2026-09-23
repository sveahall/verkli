import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  DM_MAX_BODY_LENGTH,
  DM_RATE_LIMIT_MAX_MESSAGES,
  DM_RATE_LIMIT_WINDOW_SECONDS,
  toConversationPair,
  getOtherParticipantId,
  isConversationParticipant,
  canSendInConversation,
  resolveNewConversationStatus,
  getMessagingRolesForUsers,
  getMessagingRoleForUser,
  isBlockedBetweenUsers,
  getConversationByPair,
  getConversationById,
  consumeMessageRateLimit,
  listConversationsForUserByStatus,
  getConversationDetailForUser,
  type ConversationRow,
} from "./server";

// ── Supabase mock builder ────────────────────────────────────────────
// Builds a chainable Supabase query that resolves to a configurable result.

type MockResult = { data: unknown; error: unknown };

/**
 * Creates a chainable mock that mirrors the Supabase PostgREST builder.
 * Every method returns the chain. The chain is also thenable so bare
 * `await admin.from("x").select("y").eq(...)` resolves to `result`.
 *
 * Terminal methods (.single / .maybeSingle) resolve to the same result.
 */
function mockQuery(result: MockResult = { data: null, error: null }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  const methods = [
    "select", "insert", "update", "upsert", "delete",
    "eq", "in", "order", "limit", "range",
    "single", "maybeSingle",
  ];
  for (const method of methods) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }
  chain.single!.mockResolvedValue(result);
  chain.maybeSingle!.mockResolvedValue(result);
  // Make the chain itself thenable
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (chain as any).then = (
    onFulfilled?: ((v: MockResult) => unknown) | null,
    onRejected?: ((e: unknown) => unknown) | null,
  ) => Promise.resolve(result).then(onFulfilled, onRejected);
  return chain;
}

/**
 * Creates a mock admin Supabase client.
 * `from` is a record of table name -> query chain.
 * `rpc` is a mock function for stored-procedure calls.
 */
function createMockAdmin(overrides: {
  from?: Record<string, ReturnType<typeof mockQuery>>;
  rpc?: ReturnType<typeof vi.fn>;
} = {}) {
  const tables = overrides.from ?? {};
  const rpcFn = overrides.rpc ?? vi.fn().mockResolvedValue({ data: true, error: null });

  return {
    from: vi.fn((table: string) => {
      if (tables[table]) return tables[table];
      return mockQuery();
    }),
    rpc: rpcFn,
  } as unknown as ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>;
}

// ── Fixtures ─────────────────────────────────────────────────────────

const USER_A = "00000000-0000-4000-a000-000000000001";
const USER_B = "00000000-0000-4000-a000-000000000002";
const USER_C = "00000000-0000-4000-a000-000000000003";
const CONV_ID = "11111111-1111-4111-b111-111111111111";

function makeConversation(overrides: Partial<ConversationRow> = {}): ConversationRow {
  return {
    id: CONV_ID,
    participant_one_id: USER_A,
    participant_two_id: USER_B,
    requester_id: USER_A,
    status: "accepted",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    last_message_at: null,
    ...overrides,
  };
}

// ────────────────────────────────────────────────────────────────────
describe("lib/messages/server", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ── Constants ────────────────────────────────────────────────────
  describe("constants", () => {
    it("exports expected rate limit constants", () => {
      expect(DM_MAX_BODY_LENGTH).toBe(2000);
      expect(DM_RATE_LIMIT_MAX_MESSAGES).toBe(12);
      expect(DM_RATE_LIMIT_WINDOW_SECONDS).toBe(60);
    });
  });

  // ── toConversationPair ───────────────────────────────────────────
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
      const forward = toConversationPair("user-a", "user-b");
      const reverse = toConversationPair("user-b", "user-a");
      expect(forward).toEqual(reverse);
    });

    it("handles identical user ids", () => {
      const result = toConversationPair("same", "same");
      expect(result.participantOneId).toBe("same");
      expect(result.participantTwoId).toBe("same");
    });
  });

  // ── getOtherParticipantId ────────────────────────────────────────
  describe("getOtherParticipantId", () => {
    const conversation = makeConversation();

    it("returns participant_two when current user is participant_one", () => {
      expect(getOtherParticipantId(conversation, USER_A)).toBe(USER_B);
    });

    it("returns participant_one when current user is participant_two", () => {
      expect(getOtherParticipantId(conversation, USER_B)).toBe(USER_A);
    });
  });

  // ── isConversationParticipant ────────────────────────────────────
  describe("isConversationParticipant", () => {
    const conversation = makeConversation();

    it("returns true for participant_one", () => {
      expect(isConversationParticipant(conversation, USER_A)).toBe(true);
    });

    it("returns true for participant_two", () => {
      expect(isConversationParticipant(conversation, USER_B)).toBe(true);
    });

    it("returns false for non-participant", () => {
      expect(isConversationParticipant(conversation, USER_C)).toBe(false);
    });
  });

  // ── canSendInConversation ────────────────────────────────────────
  describe("canSendInConversation", () => {
    it("allows both parties in accepted conversations", () => {
      const conv = { status: "accepted" as const, requester_id: USER_A };
      expect(canSendInConversation(conv, USER_A)).toBe(true);
      expect(canSendInConversation(conv, USER_B)).toBe(true);
    });

    it("blocks both parties in blocked conversations", () => {
      const conv = { status: "blocked" as const, requester_id: USER_A };
      expect(canSendInConversation(conv, USER_A)).toBe(false);
      expect(canSendInConversation(conv, USER_B)).toBe(false);
    });

    it("allows only the requester in request-status conversations", () => {
      const conv = { status: "request" as const, requester_id: USER_A };
      expect(canSendInConversation(conv, USER_A)).toBe(true);
      expect(canSendInConversation(conv, USER_B)).toBe(false);
    });
  });

  // ── resolveNewConversationStatus ─────────────────────────────────
  describe("resolveNewConversationStatus", () => {
    it("returns 'request' when reader messages author", () => {
      expect(resolveNewConversationStatus("reader", "author")).toBe("request");
    });

    it("returns 'accepted' when author messages reader", () => {
      expect(resolveNewConversationStatus("author", "reader")).toBe("accepted");
    });

    it("returns 'accepted' when author messages author", () => {
      expect(resolveNewConversationStatus("author", "author")).toBe("accepted");
    });

    it("returns 'accepted' when reader messages reader", () => {
      expect(resolveNewConversationStatus("reader", "reader")).toBe("accepted");
    });
  });

  // ── getMessagingRolesForUsers ────────────────────────────────────
  describe("getMessagingRolesForUsers", () => {
    it("returns empty map for empty input", async () => {
      const admin = createMockAdmin();
      const result = await getMessagingRolesForUsers(admin, []);
      expect(result.size).toBe(0);
    });

    it("classifies a profile with role=author as author", async () => {
      const profilesQuery = mockQuery({
        data: [{ user_id: USER_A, role: "author" }],
        error: null,
      });
      const applicationsQuery = mockQuery({ data: [], error: null });

      const admin = createMockAdmin({
        from: {
          profiles: profilesQuery,
          author_applications: applicationsQuery,
        },
      });

      const result = await getMessagingRolesForUsers(admin, [USER_A]);
      expect(result.get(USER_A)).toBe("author");
    });

    it("promotes user to author when author_application is approved", async () => {
      const profilesQuery = mockQuery({
        data: [{ user_id: USER_A, role: "reader" }],
        error: null,
      });
      const applicationsQuery = mockQuery({
        data: [{ user_id: USER_A, status: "approved" }],
        error: null,
      });

      const admin = createMockAdmin({
        from: {
          profiles: profilesQuery,
          author_applications: applicationsQuery,
        },
      });

      const result = await getMessagingRolesForUsers(admin, [USER_A]);
      expect(result.get(USER_A)).toBe("author");
    });

    it("keeps reader when author application is pending", async () => {
      const profilesQuery = mockQuery({ data: [], error: null });
      const applicationsQuery = mockQuery({
        data: [{ user_id: USER_A, status: "pending" }],
        error: null,
      });

      const admin = createMockAdmin({
        from: {
          profiles: profilesQuery,
          author_applications: applicationsQuery,
        },
      });

      const result = await getMessagingRolesForUsers(admin, [USER_A]);
      expect(result.get(USER_A)).toBe("reader");
    });

    it("defaults unknown users to reader", async () => {
      const profilesQuery = mockQuery({ data: [], error: null });
      const applicationsQuery = mockQuery({ data: [], error: null });

      const admin = createMockAdmin({
        from: {
          profiles: profilesQuery,
          author_applications: applicationsQuery,
        },
      });

      const result = await getMessagingRolesForUsers(admin, [USER_A]);
      expect(result.get(USER_A)).toBe("reader");
    });

    it("deduplicates user IDs and filters empty strings", async () => {
      const profilesQuery = mockQuery({ data: [], error: null });
      const applicationsQuery = mockQuery({ data: [], error: null });

      const admin = createMockAdmin({
        from: {
          profiles: profilesQuery,
          author_applications: applicationsQuery,
        },
      });

      const result = await getMessagingRolesForUsers(admin, [USER_A, USER_A, ""]);
      expect(result.size).toBe(1);
      expect(result.has(USER_A)).toBe(true);
    });

    it("handles multiple users with mixed roles", async () => {
      const profilesQuery = mockQuery({
        data: [
          { user_id: USER_A, role: "author" },
          { user_id: USER_B, role: null },
        ],
        error: null,
      });
      const applicationsQuery = mockQuery({ data: [], error: null });

      const admin = createMockAdmin({
        from: {
          profiles: profilesQuery,
          author_applications: applicationsQuery,
        },
      });

      const result = await getMessagingRolesForUsers(admin, [USER_A, USER_B, USER_C]);
      expect(result.get(USER_A)).toBe("author");
      expect(result.get(USER_B)).toBe("reader");
      expect(result.get(USER_C)).toBe("reader");
    });

    it("treats null role in profile as reader", async () => {
      const profilesQuery = mockQuery({
        data: [{ user_id: USER_A, role: null }],
        error: null,
      });
      const applicationsQuery = mockQuery({ data: [], error: null });

      const admin = createMockAdmin({
        from: {
          profiles: profilesQuery,
          author_applications: applicationsQuery,
        },
      });

      const result = await getMessagingRolesForUsers(admin, [USER_A]);
      expect(result.get(USER_A)).toBe("reader");
    });

    it("throws when profiles query fails", async () => {
      const profilesQuery = mockQuery({
        data: null,
        error: { message: "connection refused" },
      });
      const applicationsQuery = mockQuery({ data: [], error: null });

      const admin = createMockAdmin({
        from: {
          profiles: profilesQuery,
          author_applications: applicationsQuery,
        },
      });

      await expect(getMessagingRolesForUsers(admin, [USER_A])).rejects.toThrow(
        "Failed to load profiles for roles",
      );
    });

    it("throws when author_applications query fails", async () => {
      const profilesQuery = mockQuery({ data: [], error: null });
      const applicationsQuery = mockQuery({
        data: null,
        error: { message: "table missing" },
      });

      const admin = createMockAdmin({
        from: {
          profiles: profilesQuery,
          author_applications: applicationsQuery,
        },
      });

      await expect(getMessagingRolesForUsers(admin, [USER_A])).rejects.toThrow(
        "Failed to load author applications for roles",
      );
    });
  });

  // ── getMessagingRoleForUser ──────────────────────────────────────
  describe("getMessagingRoleForUser", () => {
    it("returns author role for a user with author profile", async () => {
      const profilesQuery = mockQuery({
        data: [{ user_id: USER_A, role: "author" }],
        error: null,
      });
      const applicationsQuery = mockQuery({ data: [], error: null });

      const admin = createMockAdmin({
        from: {
          profiles: profilesQuery,
          author_applications: applicationsQuery,
        },
      });

      const role = await getMessagingRoleForUser(admin, USER_A);
      expect(role).toBe("author");
    });

    it("defaults to reader when user not found", async () => {
      const profilesQuery = mockQuery({ data: [], error: null });
      const applicationsQuery = mockQuery({ data: [], error: null });

      const admin = createMockAdmin({
        from: {
          profiles: profilesQuery,
          author_applications: applicationsQuery,
        },
      });

      const role = await getMessagingRoleForUser(admin, USER_A);
      expect(role).toBe("reader");
    });
  });

  // ── isBlockedBetweenUsers ────────────────────────────────────────
  describe("isBlockedBetweenUsers", () => {
    it("returns not blocked when no blocks exist", async () => {
      const blocksQuery = mockQuery({ data: null, error: null });

      const admin = createMockAdmin({
        from: { message_user_blocks: blocksQuery },
      });

      const result = await isBlockedBetweenUsers(admin, USER_A, USER_B);
      expect(result).toEqual({ blocked: false, blockedBy: null });
    });

    it("returns blocked=true when forward block exists (A blocked B)", async () => {
      let callCount = 0;
      const blocksQuery = mockQuery();
      blocksQuery.maybeSingle!.mockImplementation(() => {
        callCount++;
        return callCount === 1
          ? Promise.resolve({ data: { blocker_id: USER_A }, error: null })
          : Promise.resolve({ data: null, error: null });
      });

      const admin = createMockAdmin({
        from: { message_user_blocks: blocksQuery },
      });

      const result = await isBlockedBetweenUsers(admin, USER_A, USER_B);
      expect(result).toEqual({ blocked: true, blockedBy: USER_A });
    });

    it("returns blocked=true when reverse block exists (B blocked A)", async () => {
      let callCount = 0;
      const blocksQuery = mockQuery();
      blocksQuery.maybeSingle!.mockImplementation(() => {
        callCount++;
        return callCount === 1
          ? Promise.resolve({ data: null, error: null })
          : Promise.resolve({ data: { blocker_id: USER_B }, error: null });
      });

      const admin = createMockAdmin({
        from: { message_user_blocks: blocksQuery },
      });

      const result = await isBlockedBetweenUsers(admin, USER_A, USER_B);
      expect(result).toEqual({ blocked: true, blockedBy: USER_B });
    });

    it("throws when forward block check fails", async () => {
      const blocksQuery = mockQuery();
      blocksQuery.maybeSingle!.mockResolvedValue({
        data: null,
        error: { message: "db error" },
      });

      const admin = createMockAdmin({
        from: { message_user_blocks: blocksQuery },
      });

      await expect(isBlockedBetweenUsers(admin, USER_A, USER_B)).rejects.toThrow(
        "Failed to check block list",
      );
    });

    it("throws when reverse block check fails", async () => {
      let callCount = 0;
      const blocksQuery = mockQuery();
      blocksQuery.maybeSingle!.mockImplementation(() => {
        callCount++;
        return callCount === 1
          ? Promise.resolve({ data: null, error: null })
          : Promise.resolve({ data: null, error: { message: "timeout" } });
      });

      const admin = createMockAdmin({
        from: { message_user_blocks: blocksQuery },
      });

      await expect(isBlockedBetweenUsers(admin, USER_A, USER_B)).rejects.toThrow(
        "Failed to check block list (reverse)",
      );
    });
  });

  // ── getConversationByPair ────────────────────────────────────────
  describe("getConversationByPair", () => {
    it("returns conversation when it exists", async () => {
      const conv = makeConversation();
      const conversationsQuery = mockQuery({ data: conv, error: null });

      const admin = createMockAdmin({
        from: { conversations: conversationsQuery },
      });

      const result = await getConversationByPair(admin, USER_A, USER_B);
      expect(result).toEqual(conv);
    });

    it("returns null when no conversation exists", async () => {
      const conversationsQuery = mockQuery({ data: null, error: null });

      const admin = createMockAdmin({
        from: { conversations: conversationsQuery },
      });

      const result = await getConversationByPair(admin, USER_A, USER_B);
      expect(result).toBeNull();
    });

    it("throws when query fails", async () => {
      const conversationsQuery = mockQuery({
        data: null,
        error: { message: "timeout" },
      });

      const admin = createMockAdmin({
        from: { conversations: conversationsQuery },
      });

      await expect(getConversationByPair(admin, USER_A, USER_B)).rejects.toThrow(
        "Failed to load conversation by pair",
      );
    });
  });

  // ── getConversationById ──────────────────────────────────────────
  describe("getConversationById", () => {
    it("returns conversation when found", async () => {
      const conv = makeConversation();
      const conversationsQuery = mockQuery({ data: conv, error: null });

      const admin = createMockAdmin({
        from: { conversations: conversationsQuery },
      });

      const result = await getConversationById(admin, CONV_ID);
      expect(result).toEqual(conv);
    });

    it("returns null when not found", async () => {
      const conversationsQuery = mockQuery({ data: null, error: null });

      const admin = createMockAdmin({
        from: { conversations: conversationsQuery },
      });

      const result = await getConversationById(admin, CONV_ID);
      expect(result).toBeNull();
    });

    it("throws when query fails", async () => {
      const conversationsQuery = mockQuery({
        data: null,
        error: { message: "internal" },
      });

      const admin = createMockAdmin({
        from: { conversations: conversationsQuery },
      });

      await expect(getConversationById(admin, CONV_ID)).rejects.toThrow(
        "Failed to load conversation",
      );
    });
  });

  // ── consumeMessageRateLimit ──────────────────────────────────────
  describe("consumeMessageRateLimit", () => {
    it("returns true when under rate limit", async () => {
      const admin = createMockAdmin({
        rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
      });

      const result = await consumeMessageRateLimit(admin, USER_A);
      expect(result).toBe(true);
    });

    it("returns false when rate limit exceeded", async () => {
      const admin = createMockAdmin({
        rpc: vi.fn().mockResolvedValue({ data: false, error: null }),
      });

      const result = await consumeMessageRateLimit(admin, USER_A);
      expect(result).toBe(false);
    });

    it("passes default parameters to RPC", async () => {
      const rpcMock = vi.fn().mockResolvedValue({ data: true, error: null });
      const admin = createMockAdmin({ rpc: rpcMock });

      await consumeMessageRateLimit(admin, USER_A);

      expect(rpcMock).toHaveBeenCalledWith("dm_consume_rate_limit", {
        p_sender_id: USER_A,
        p_max: DM_RATE_LIMIT_MAX_MESSAGES,
        p_window_seconds: DM_RATE_LIMIT_WINDOW_SECONDS,
      });
    });

    it("passes custom maxMessages and windowSeconds to RPC", async () => {
      const rpcMock = vi.fn().mockResolvedValue({ data: true, error: null });
      const admin = createMockAdmin({ rpc: rpcMock });

      await consumeMessageRateLimit(admin, USER_A, {
        maxMessages: 5,
        windowSeconds: 30,
      });

      expect(rpcMock).toHaveBeenCalledWith("dm_consume_rate_limit", {
        p_sender_id: USER_A,
        p_max: 5,
        p_window_seconds: 30,
      });
    });

    it("throws when RPC fails", async () => {
      const admin = createMockAdmin({
        rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "rpc down" } }),
      });

      await expect(consumeMessageRateLimit(admin, USER_A)).rejects.toThrow(
        "Rate limit RPC failed",
      );
    });

    it("coerces falsy RPC data to false", async () => {
      const admin = createMockAdmin({
        rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
      });

      const result = await consumeMessageRateLimit(admin, USER_A);
      expect(result).toBe(false);
    });
  });

  // ── listConversationsForUserByStatus ─────────────────────────────
  describe("listConversationsForUserByStatus", () => {
    it("returns empty array when user has no conversations", async () => {
      const participantsQuery = mockQuery({ data: [], error: null });

      const admin = createMockAdmin({
        from: { conversation_participants: participantsQuery },
      });

      const result = await listConversationsForUserByStatus({
        admin,
        currentUserId: USER_A,
        currentUserRole: "author",
        status: "accepted",
      });

      expect(result).toEqual([]);
    });

    it("returns sorted conversation summaries (newest first)", async () => {
      const conv1 = makeConversation({
        id: "conv-1",
        last_message_at: "2026-01-02T00:00:00Z",
      });
      const conv2 = makeConversation({
        id: "conv-2",
        participant_two_id: USER_C,
        last_message_at: "2026-01-03T00:00:00Z",
      });

      const participantsQuery = mockQuery({
        data: [{ conversation_id: "conv-1" }, { conversation_id: "conv-2" }],
        error: null,
      });
      const conversationsQuery = mockQuery({ data: [conv1, conv2], error: null });
      const blocksQuery = mockQuery({ data: [], error: null });
      const profilesQuery = mockQuery({
        data: [
          { user_id: USER_B, display_name: "User B", username: "userb", avatar_url: null, role: "reader" },
          { user_id: USER_C, display_name: "User C", username: "userc", avatar_url: null, role: "author" },
        ],
        error: null,
      });
      const applicationsQuery = mockQuery({ data: [], error: null });
      const messagesQuery = mockQuery({
        data: [
          { id: "msg-2", conversation_id: "conv-2", sender_id: USER_C, body: "Hello", created_at: "2026-01-03T00:00:00Z" },
          { id: "msg-1", conversation_id: "conv-1", sender_id: USER_B, body: "Hi", created_at: "2026-01-02T00:00:00Z" },
        ],
        error: null,
      });

      const admin = createMockAdmin({
        from: {
          conversation_participants: participantsQuery,
          conversations: conversationsQuery,
          message_user_blocks: blocksQuery,
          profiles: profilesQuery,
          author_applications: applicationsQuery,
          messages: messagesQuery,
        },
      });

      const result = await listConversationsForUserByStatus({
        admin,
        currentUserId: USER_A,
        currentUserRole: "author",
        status: "accepted",
      });

      expect(result).toHaveLength(2);
      // conv-2 has a more recent last_message_at -> should come first
      expect(result[0].id).toBe("conv-2");
      expect(result[1].id).toBe("conv-1");
      // Verify summary shape
      expect(result[0].otherUser.name).toBe("User C");
      expect(result[0].lastMessage).toEqual({
        id: "msg-2",
        senderId: USER_C,
        body: "Hello",
        createdAt: "2026-01-03T00:00:00Z",
      });
    });

    it("filters out conversations where other user is blocked", async () => {
      const conv = makeConversation();

      const participantsQuery = mockQuery({
        data: [{ conversation_id: CONV_ID }],
        error: null,
      });
      const conversationsQuery = mockQuery({ data: [conv], error: null });

      // USER_A has blocked USER_B
      const blocksQuery = mockQuery({
        data: [{ blocked_id: USER_B }],
        error: null,
      });

      const admin = createMockAdmin({
        from: {
          conversation_participants: participantsQuery,
          conversations: conversationsQuery,
          message_user_blocks: blocksQuery,
        },
      });

      const result = await listConversationsForUserByStatus({
        admin,
        currentUserId: USER_A,
        currentUserRole: "author",
        status: "accepted",
      });

      expect(result).toEqual([]);
    });

    it("throws when conversations query fails", async () => {
      const participantsQuery = mockQuery({
        data: [{ conversation_id: CONV_ID }],
        error: null,
      });
      const conversationsQuery = mockQuery({
        data: null,
        error: { message: "db error" },
      });

      const admin = createMockAdmin({
        from: {
          conversation_participants: participantsQuery,
          conversations: conversationsQuery,
        },
      });

      await expect(
        listConversationsForUserByStatus({
          admin,
          currentUserId: USER_A,
          currentUserRole: "author",
          status: "accepted",
        }),
      ).rejects.toThrow("Failed to load conversations");
    });

    it("throws when conversation_participants query fails", async () => {
      const participantsQuery = mockQuery({
        data: null,
        error: { message: "relation not found" },
      });

      const admin = createMockAdmin({
        from: { conversation_participants: participantsQuery },
      });

      await expect(
        listConversationsForUserByStatus({
          admin,
          currentUserId: USER_A,
          currentUserRole: "author",
          status: "accepted",
        }),
      ).rejects.toThrow("Failed to load user conversation ids");
    });

    it("sets canAccept=true for request when recipient is author and not requester", async () => {
      const conv = makeConversation({
        status: "request",
        requester_id: USER_B, // B requested, A is the recipient
      });

      const participantsQuery = mockQuery({
        data: [{ conversation_id: CONV_ID }],
        error: null,
      });
      const conversationsQuery = mockQuery({ data: [conv], error: null });
      const blocksQuery = mockQuery({ data: [], error: null });
      const profilesQuery = mockQuery({
        data: [{ user_id: USER_B, display_name: "Reader B", username: "rb", avatar_url: null, role: "reader" }],
        error: null,
      });
      const applicationsQuery = mockQuery({ data: [], error: null });
      const messagesQuery = mockQuery({ data: [], error: null });

      const admin = createMockAdmin({
        from: {
          conversation_participants: participantsQuery,
          conversations: conversationsQuery,
          message_user_blocks: blocksQuery,
          profiles: profilesQuery,
          author_applications: applicationsQuery,
          messages: messagesQuery,
        },
      });

      const result = await listConversationsForUserByStatus({
        admin,
        currentUserId: USER_A,
        currentUserRole: "author",
        status: "request",
      });

      expect(result).toHaveLength(1);
      expect(result[0].canAccept).toBe(true);
    });

    it("sets canAccept=false when current user is the requester", async () => {
      const conv = makeConversation({
        status: "request",
        requester_id: USER_A,
      });

      const participantsQuery = mockQuery({
        data: [{ conversation_id: CONV_ID }],
        error: null,
      });
      const conversationsQuery = mockQuery({ data: [conv], error: null });
      const blocksQuery = mockQuery({ data: [], error: null });
      const profilesQuery = mockQuery({
        data: [{ user_id: USER_B, display_name: "Author B", username: "ab", avatar_url: null, role: "author" }],
        error: null,
      });
      const applicationsQuery = mockQuery({ data: [], error: null });
      const messagesQuery = mockQuery({ data: [], error: null });

      const admin = createMockAdmin({
        from: {
          conversation_participants: participantsQuery,
          conversations: conversationsQuery,
          message_user_blocks: blocksQuery,
          profiles: profilesQuery,
          author_applications: applicationsQuery,
          messages: messagesQuery,
        },
      });

      const result = await listConversationsForUserByStatus({
        admin,
        currentUserId: USER_A,
        currentUserRole: "author",
        status: "request",
      });

      expect(result).toHaveLength(1);
      expect(result[0].canAccept).toBe(false);
    });

    it("sets canAccept=false when current user is a reader", async () => {
      const conv = makeConversation({
        status: "request",
        requester_id: USER_B,
      });

      const participantsQuery = mockQuery({
        data: [{ conversation_id: CONV_ID }],
        error: null,
      });
      const conversationsQuery = mockQuery({ data: [conv], error: null });
      const blocksQuery = mockQuery({ data: [], error: null });
      const profilesQuery = mockQuery({
        data: [{ user_id: USER_B, display_name: "Reader B", username: "rb", avatar_url: null, role: "reader" }],
        error: null,
      });
      const applicationsQuery = mockQuery({ data: [], error: null });
      const messagesQuery = mockQuery({ data: [], error: null });

      const admin = createMockAdmin({
        from: {
          conversation_participants: participantsQuery,
          conversations: conversationsQuery,
          message_user_blocks: blocksQuery,
          profiles: profilesQuery,
          author_applications: applicationsQuery,
          messages: messagesQuery,
        },
      });

      const result = await listConversationsForUserByStatus({
        admin,
        currentUserId: USER_A,
        currentUserRole: "reader",
        status: "request",
      });

      expect(result).toHaveLength(1);
      expect(result[0].canAccept).toBe(false);
    });

    it("falls back to role-based name when profile has no display_name or username", async () => {
      const conv = makeConversation();

      const participantsQuery = mockQuery({
        data: [{ conversation_id: CONV_ID }],
        error: null,
      });
      const conversationsQuery = mockQuery({ data: [conv], error: null });
      const blocksQuery = mockQuery({ data: [], error: null });
      const profilesQuery = mockQuery({
        data: [{ user_id: USER_B, display_name: null, username: null, avatar_url: null, role: null }],
        error: null,
      });
      const applicationsQuery = mockQuery({ data: [], error: null });
      const messagesQuery = mockQuery({ data: [], error: null });

      const admin = createMockAdmin({
        from: {
          conversation_participants: participantsQuery,
          conversations: conversationsQuery,
          message_user_blocks: blocksQuery,
          profiles: profilesQuery,
          author_applications: applicationsQuery,
          messages: messagesQuery,
        },
      });

      const result = await listConversationsForUserByStatus({
        admin,
        currentUserId: USER_A,
        currentUserRole: "author",
        status: "accepted",
      });

      expect(result).toHaveLength(1);
      // USER_B defaults to reader role, so the fallback name should be "Reader"
      expect(result[0].otherUser.name).toBe("Reader");
    });

    it("uses username as name fallback when display_name is empty string", async () => {
      const conv = makeConversation();

      const participantsQuery = mockQuery({
        data: [{ conversation_id: CONV_ID }],
        error: null,
      });
      const conversationsQuery = mockQuery({ data: [conv], error: null });
      const blocksQuery = mockQuery({ data: [], error: null });
      const profilesQuery = mockQuery({
        data: [{ user_id: USER_B, display_name: "  ", username: "bob123", avatar_url: null, role: "reader" }],
        error: null,
      });
      const applicationsQuery = mockQuery({ data: [], error: null });
      const messagesQuery = mockQuery({ data: [], error: null });

      const admin = createMockAdmin({
        from: {
          conversation_participants: participantsQuery,
          conversations: conversationsQuery,
          message_user_blocks: blocksQuery,
          profiles: profilesQuery,
          author_applications: applicationsQuery,
          messages: messagesQuery,
        },
      });

      const result = await listConversationsForUserByStatus({
        admin,
        currentUserId: USER_A,
        currentUserRole: "author",
        status: "accepted",
      });

      expect(result).toHaveLength(1);
      expect(result[0].otherUser.name).toBe("bob123");
    });

    it("handles lastMessage=null when no messages exist for a conversation", async () => {
      const conv = makeConversation();

      const participantsQuery = mockQuery({
        data: [{ conversation_id: CONV_ID }],
        error: null,
      });
      const conversationsQuery = mockQuery({ data: [conv], error: null });
      const blocksQuery = mockQuery({ data: [], error: null });
      const profilesQuery = mockQuery({
        data: [{ user_id: USER_B, display_name: "Bob", username: "bob", avatar_url: null, role: "reader" }],
        error: null,
      });
      const applicationsQuery = mockQuery({ data: [], error: null });
      const messagesQuery = mockQuery({ data: [], error: null });

      const admin = createMockAdmin({
        from: {
          conversation_participants: participantsQuery,
          conversations: conversationsQuery,
          message_user_blocks: blocksQuery,
          profiles: profilesQuery,
          author_applications: applicationsQuery,
          messages: messagesQuery,
        },
      });

      const result = await listConversationsForUserByStatus({
        admin,
        currentUserId: USER_A,
        currentUserRole: "author",
        status: "accepted",
      });

      expect(result).toHaveLength(1);
      expect(result[0].lastMessage).toBeNull();
    });

    it("sorts by updated_at when last_message_at is null", async () => {
      const conv1 = makeConversation({
        id: "conv-1",
        last_message_at: null,
        updated_at: "2026-01-05T00:00:00Z",
      });
      const conv2 = makeConversation({
        id: "conv-2",
        participant_two_id: USER_C,
        last_message_at: null,
        updated_at: "2026-01-10T00:00:00Z",
      });

      const participantsQuery = mockQuery({
        data: [{ conversation_id: "conv-1" }, { conversation_id: "conv-2" }],
        error: null,
      });
      const conversationsQuery = mockQuery({ data: [conv1, conv2], error: null });
      const blocksQuery = mockQuery({ data: [], error: null });
      const profilesQuery = mockQuery({
        data: [
          { user_id: USER_B, display_name: "B", username: "b", avatar_url: null, role: "reader" },
          { user_id: USER_C, display_name: "C", username: "c", avatar_url: null, role: "reader" },
        ],
        error: null,
      });
      const applicationsQuery = mockQuery({ data: [], error: null });
      const messagesQuery = mockQuery({ data: [], error: null });

      const admin = createMockAdmin({
        from: {
          conversation_participants: participantsQuery,
          conversations: conversationsQuery,
          message_user_blocks: blocksQuery,
          profiles: profilesQuery,
          author_applications: applicationsQuery,
          messages: messagesQuery,
        },
      });

      const result = await listConversationsForUserByStatus({
        admin,
        currentUserId: USER_A,
        currentUserRole: "author",
        status: "accepted",
      });

      expect(result).toHaveLength(2);
      // conv-2 has more recent updated_at
      expect(result[0].id).toBe("conv-2");
      expect(result[1].id).toBe("conv-1");
    });
  });

  // ── getConversationDetailForUser ─────────────────────────────────
  describe("getConversationDetailForUser", () => {
    it("returns null when conversation does not exist", async () => {
      const conversationsQuery = mockQuery({ data: null, error: null });

      const admin = createMockAdmin({
        from: { conversations: conversationsQuery },
      });

      const result = await getConversationDetailForUser({
        admin,
        currentUserId: USER_A,
        currentUserRole: "author",
        conversationId: CONV_ID,
      });

      expect(result).toBeNull();
    });

    it("returns null when user is not a participant", async () => {
      const conv = makeConversation(); // participants are USER_A and USER_B
      const conversationsQuery = mockQuery({ data: conv, error: null });

      const admin = createMockAdmin({
        from: { conversations: conversationsQuery },
      });

      const result = await getConversationDetailForUser({
        admin,
        currentUserId: USER_C,
        currentUserRole: "author",
        conversationId: CONV_ID,
      });

      expect(result).toBeNull();
    });

    it("returns null when users are blocked", async () => {
      const conv = makeConversation();
      const conversationsQuery = mockQuery({ data: conv, error: null });

      let callCount = 0;
      const blocksQuery = mockQuery();
      blocksQuery.maybeSingle!.mockImplementation(() => {
        callCount++;
        return callCount === 1
          ? Promise.resolve({ data: { blocker_id: USER_A }, error: null })
          : Promise.resolve({ data: null, error: null });
      });

      const admin = createMockAdmin({
        from: {
          conversations: conversationsQuery,
          message_user_blocks: blocksQuery,
        },
      });

      const result = await getConversationDetailForUser({
        admin,
        currentUserId: USER_A,
        currentUserRole: "author",
        conversationId: CONV_ID,
      });

      expect(result).toBeNull();
    });

    it("returns conversation detail with messages in ascending order", async () => {
      const conv = makeConversation();
      const conversationsQuery = mockQuery({ data: conv, error: null });
      const blocksQuery = mockQuery({ data: null, error: null });

      const profilesQuery = mockQuery({
        data: [{ user_id: USER_B, display_name: "Bob", username: "bob", avatar_url: "https://img.co/bob.jpg", role: "reader" }],
        error: null,
      });
      const applicationsQuery = mockQuery({ data: [], error: null });

      const messagesQuery = mockQuery({
        data: [
          { id: "msg-1", conversation_id: CONV_ID, sender_id: USER_A, body: "Hello", created_at: "2026-01-01T12:00:00Z" },
          { id: "msg-2", conversation_id: CONV_ID, sender_id: USER_B, body: "Hi!", created_at: "2026-01-01T12:01:00Z" },
          { id: "msg-3", conversation_id: CONV_ID, sender_id: USER_A, body: "How are you?", created_at: "2026-01-01T12:02:00Z" },
        ],
        error: null,
      });

      const admin = createMockAdmin({
        from: {
          conversations: conversationsQuery,
          message_user_blocks: blocksQuery,
          profiles: profilesQuery,
          author_applications: applicationsQuery,
          messages: messagesQuery,
        },
      });

      const result = await getConversationDetailForUser({
        admin,
        currentUserId: USER_A,
        currentUserRole: "author",
        conversationId: CONV_ID,
      });

      expect(result).not.toBeNull();
      expect(result!.conversation.id).toBe(CONV_ID);
      expect(result!.conversation.status).toBe("accepted");
      expect(result!.conversation.otherUser.id).toBe(USER_B);
      expect(result!.conversation.otherUser.name).toBe("Bob");
      expect(result!.conversation.otherUser.avatarUrl).toBe("https://img.co/bob.jpg");
      expect(result!.messages).toHaveLength(3);
      expect(result!.messages[0].body).toBe("Hello");
      expect(result!.messages[2].body).toBe("How are you?");
    });

    it("sets lastMessage from the last message in the list", async () => {
      const conv = makeConversation();
      const conversationsQuery = mockQuery({ data: conv, error: null });
      const blocksQuery = mockQuery({ data: null, error: null });
      const profilesQuery = mockQuery({
        data: [{ user_id: USER_B, display_name: "Bob", username: "bob", avatar_url: null, role: "reader" }],
        error: null,
      });
      const applicationsQuery = mockQuery({ data: [], error: null });

      const messagesQuery = mockQuery({
        data: [
          { id: "msg-1", conversation_id: CONV_ID, sender_id: USER_A, body: "First", created_at: "2026-01-01T12:00:00Z" },
          { id: "msg-2", conversation_id: CONV_ID, sender_id: USER_B, body: "Second", created_at: "2026-01-01T12:01:00Z" },
        ],
        error: null,
      });

      const admin = createMockAdmin({
        from: {
          conversations: conversationsQuery,
          message_user_blocks: blocksQuery,
          profiles: profilesQuery,
          author_applications: applicationsQuery,
          messages: messagesQuery,
        },
      });

      const result = await getConversationDetailForUser({
        admin,
        currentUserId: USER_A,
        currentUserRole: "author",
        conversationId: CONV_ID,
      });

      expect(result!.conversation.lastMessage).toEqual({
        id: "msg-2",
        senderId: USER_B,
        body: "Second",
        createdAt: "2026-01-01T12:01:00Z",
      });
    });

    it("sets lastMessage to null when there are no messages", async () => {
      const conv = makeConversation();
      const conversationsQuery = mockQuery({ data: conv, error: null });
      const blocksQuery = mockQuery({ data: null, error: null });
      const profilesQuery = mockQuery({
        data: [{ user_id: USER_B, display_name: "Bob", username: "bob", avatar_url: null, role: "reader" }],
        error: null,
      });
      const applicationsQuery = mockQuery({ data: [], error: null });
      const messagesQuery = mockQuery({ data: [], error: null });

      const admin = createMockAdmin({
        from: {
          conversations: conversationsQuery,
          message_user_blocks: blocksQuery,
          profiles: profilesQuery,
          author_applications: applicationsQuery,
          messages: messagesQuery,
        },
      });

      const result = await getConversationDetailForUser({
        admin,
        currentUserId: USER_A,
        currentUserRole: "author",
        conversationId: CONV_ID,
      });

      expect(result!.conversation.lastMessage).toBeNull();
    });

    it("throws when messages query fails", async () => {
      const conv = makeConversation();
      const conversationsQuery = mockQuery({ data: conv, error: null });
      const blocksQuery = mockQuery({ data: null, error: null });
      const profilesQuery = mockQuery({ data: [], error: null });
      const applicationsQuery = mockQuery({ data: [], error: null });
      const messagesQuery = mockQuery({
        data: null,
        error: { message: "query timeout" },
      });

      const admin = createMockAdmin({
        from: {
          conversations: conversationsQuery,
          message_user_blocks: blocksQuery,
          profiles: profilesQuery,
          author_applications: applicationsQuery,
          messages: messagesQuery,
        },
      });

      await expect(
        getConversationDetailForUser({
          admin,
          currentUserId: USER_A,
          currentUserRole: "author",
          conversationId: CONV_ID,
        }),
      ).rejects.toThrow("Failed to load conversation messages");
    });

    it("uses Author fallback name when other user is author with no profile name", async () => {
      const conv = makeConversation();
      const conversationsQuery = mockQuery({ data: conv, error: null });
      const blocksQuery = mockQuery({ data: null, error: null });
      const profilesQuery = mockQuery({
        data: [{ user_id: USER_B, display_name: null, username: null, avatar_url: null, role: "author" }],
        error: null,
      });
      const applicationsQuery = mockQuery({
        data: [{ user_id: USER_B, status: "approved" }],
        error: null,
      });
      const messagesQuery = mockQuery({ data: [], error: null });

      const admin = createMockAdmin({
        from: {
          conversations: conversationsQuery,
          message_user_blocks: blocksQuery,
          profiles: profilesQuery,
          author_applications: applicationsQuery,
          messages: messagesQuery,
        },
      });

      const result = await getConversationDetailForUser({
        admin,
        currentUserId: USER_A,
        currentUserRole: "reader",
        conversationId: CONV_ID,
      });

      expect(result!.conversation.otherUser.name).toBe("Author");
      expect(result!.conversation.otherUser.role).toBe("author");
    });

    it("sets canAccept correctly for request conversations", async () => {
      const conv = makeConversation({
        status: "request",
        requester_id: USER_B, // B requested, A can accept as author
      });
      const conversationsQuery = mockQuery({ data: conv, error: null });
      const blocksQuery = mockQuery({ data: null, error: null });
      const profilesQuery = mockQuery({
        data: [{ user_id: USER_B, display_name: "Reader B", username: "rb", avatar_url: null, role: "reader" }],
        error: null,
      });
      const applicationsQuery = mockQuery({ data: [], error: null });
      const messagesQuery = mockQuery({ data: [], error: null });

      const admin = createMockAdmin({
        from: {
          conversations: conversationsQuery,
          message_user_blocks: blocksQuery,
          profiles: profilesQuery,
          author_applications: applicationsQuery,
          messages: messagesQuery,
        },
      });

      const result = await getConversationDetailForUser({
        admin,
        currentUserId: USER_A,
        currentUserRole: "author",
        conversationId: CONV_ID,
      });

      expect(result!.conversation.canAccept).toBe(true);
    });

    it("sets canAccept=false when requester views their own request", async () => {
      const conv = makeConversation({
        status: "request",
        requester_id: USER_A,
      });
      const conversationsQuery = mockQuery({ data: conv, error: null });
      const blocksQuery = mockQuery({ data: null, error: null });
      const profilesQuery = mockQuery({
        data: [{ user_id: USER_B, display_name: "Author B", username: "ab", avatar_url: null, role: "author" }],
        error: null,
      });
      const applicationsQuery = mockQuery({ data: [], error: null });
      const messagesQuery = mockQuery({ data: [], error: null });

      const admin = createMockAdmin({
        from: {
          conversations: conversationsQuery,
          message_user_blocks: blocksQuery,
          profiles: profilesQuery,
          author_applications: applicationsQuery,
          messages: messagesQuery,
        },
      });

      const result = await getConversationDetailForUser({
        admin,
        currentUserId: USER_A,
        currentUserRole: "author",
        conversationId: CONV_ID,
      });

      expect(result!.conversation.canAccept).toBe(false);
    });

    it("works for participant_two viewing the conversation", async () => {
      const conv = makeConversation();
      const conversationsQuery = mockQuery({ data: conv, error: null });
      const blocksQuery = mockQuery({ data: null, error: null });
      const profilesQuery = mockQuery({
        data: [{ user_id: USER_A, display_name: "Alice", username: "alice", avatar_url: null, role: "author" }],
        error: null,
      });
      const applicationsQuery = mockQuery({ data: [], error: null });
      const messagesQuery = mockQuery({ data: [], error: null });

      const admin = createMockAdmin({
        from: {
          conversations: conversationsQuery,
          message_user_blocks: blocksQuery,
          profiles: profilesQuery,
          author_applications: applicationsQuery,
          messages: messagesQuery,
        },
      });

      const result = await getConversationDetailForUser({
        admin,
        currentUserId: USER_B,
        currentUserRole: "reader",
        conversationId: CONV_ID,
      });

      expect(result).not.toBeNull();
      // Other user from B's perspective is A
      expect(result!.conversation.otherUser.id).toBe(USER_A);
      expect(result!.conversation.otherUser.name).toBe("Alice");
    });
  });
});
