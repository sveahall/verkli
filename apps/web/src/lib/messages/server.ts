import { createAdminClient } from "@/lib/supabase/admin";

export const DM_MAX_BODY_LENGTH = 2000;
export const DM_RATE_LIMIT_MAX_MESSAGES = 12;
export const DM_RATE_LIMIT_WINDOW_SECONDS = 60;

export type MessagingRole = "author" | "reader";
export type ConversationStatus = "request" | "accepted" | "blocked";

export type ConversationRow = {
  id: string;
  participant_one_id: string;
  participant_two_id: string;
  requester_id: string;
  status: ConversationStatus;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
};

type ConversationIdRow = { conversation_id: string };
type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};
type ProfileRow = {
  user_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  role: string | null;
};
type AuthorApplicationRow = { user_id: string; status: string };

type BlockByMeRow = { blocked_id: string };
type BlockMeRow = { blocker_id: string };

export type ConversationSummary = {
  id: string;
  status: ConversationStatus;
  requesterId: string;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
  canAccept: boolean;
  otherUser: {
    id: string;
    name: string;
    username: string | null;
    avatarUrl: string | null;
    role: MessagingRole;
  };
  lastMessage: {
    id: string;
    senderId: string;
    body: string;
    createdAt: string;
  } | null;
};

export type ConversationDetail = {
  conversation: ConversationSummary;
  messages: Array<{
    id: string;
    senderId: string;
    body: string;
    createdAt: string;
  }>;
};

function asRole(input: string | null | undefined): MessagingRole {
  return String(input ?? "").toLowerCase() === "author" ? "author" : "reader";
}

function isApprovedAuthorApplication(status: string | null | undefined): boolean {
  return String(status ?? "").toLowerCase() === "approved";
}

export function toConversationPair(userA: string, userB: string): {
  participantOneId: string;
  participantTwoId: string;
} {
  return userA < userB
    ? { participantOneId: userA, participantTwoId: userB }
    : { participantOneId: userB, participantTwoId: userA };
}

export function getOtherParticipantId(conversation: ConversationRow, currentUserId: string): string {
  return conversation.participant_one_id === currentUserId
    ? conversation.participant_two_id
    : conversation.participant_one_id;
}

export function isConversationParticipant(conversation: ConversationRow, userId: string): boolean {
  return conversation.participant_one_id === userId || conversation.participant_two_id === userId;
}

export function canSendInConversation(
  conversation: Pick<ConversationRow, "status" | "requester_id">,
  senderId: string
): boolean {
  if (conversation.status === "blocked") return false;
  if (conversation.status === "accepted") return true;
  return conversation.requester_id === senderId;
}

export function resolveNewConversationStatus(
  senderRole: MessagingRole,
  recipientRole: MessagingRole
): ConversationStatus {
  if (senderRole === "reader" && recipientRole === "author") {
    return "request";
  }
  return "accepted";
}

export async function getMessagingRolesForUsers(
  admin: ReturnType<typeof createAdminClient>,
  userIds: string[]
): Promise<Map<string, MessagingRole>> {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
  const roles = new Map<string, MessagingRole>();

  if (uniqueUserIds.length === 0) {
    return roles;
  }

  const [{ data: profiles, error: profilesError }, { data: applications, error: appError }] =
    await Promise.all([
      admin
        .from("profiles")
        .select("user_id, role")
        .in("user_id", uniqueUserIds),
      admin
        .from("author_applications" as never)
        .select("user_id, status")
        .in("user_id", uniqueUserIds),
    ]);

  if (profilesError) {
    throw new Error(`Failed to load profiles for roles: ${profilesError.message}`);
  }
  if (appError) {
    throw new Error(`Failed to load author applications for roles: ${appError.message}`);
  }

  for (const profile of (profiles ?? []) as Array<{ user_id: string; role: string | null }>) {
    roles.set(profile.user_id, asRole(profile.role));
  }

  for (const app of (applications ?? []) as AuthorApplicationRow[]) {
    if (isApprovedAuthorApplication(app.status)) {
      roles.set(app.user_id, "author");
    } else if (!roles.has(app.user_id)) {
      roles.set(app.user_id, "reader");
    }
  }

  for (const userId of uniqueUserIds) {
    if (!roles.has(userId)) {
      roles.set(userId, "reader");
    }
  }

  return roles;
}

export async function getMessagingRoleForUser(
  admin: ReturnType<typeof createAdminClient>,
  userId: string
): Promise<MessagingRole> {
  const roleMap = await getMessagingRolesForUsers(admin, [userId]);
  return roleMap.get(userId) ?? "reader";
}

export async function isBlockedBetweenUsers(
  admin: ReturnType<typeof createAdminClient>,
  userA: string,
  userB: string
): Promise<{ blocked: boolean; blockedBy: string | null }> {
  const [forward, reverse] = await Promise.all([
    admin
      .from("message_user_blocks")
      .select("blocker_id")
      .eq("blocker_id", userA)
      .eq("blocked_id", userB)
      .maybeSingle(),
    admin
      .from("message_user_blocks")
      .select("blocker_id")
      .eq("blocker_id", userB)
      .eq("blocked_id", userA)
      .maybeSingle(),
  ]);

  if (forward.error) {
    throw new Error(`Failed to check block list (forward): ${forward.error.message}`);
  }
  if (reverse.error) {
    throw new Error(`Failed to check block list (reverse): ${reverse.error.message}`);
  }

  if (forward.data) {
    return { blocked: true, blockedBy: userA };
  }
  if (reverse.data) {
    return { blocked: true, blockedBy: userB };
  }

  return { blocked: false, blockedBy: null };
}

export async function getConversationByPair(
  admin: ReturnType<typeof createAdminClient>,
  participantOneId: string,
  participantTwoId: string
): Promise<ConversationRow | null> {
  const { data, error } = await admin
    .from("conversations")
    .select(
      "id, participant_one_id, participant_two_id, requester_id, status, created_at, updated_at, last_message_at"
    )
    .eq("participant_one_id", participantOneId)
    .eq("participant_two_id", participantTwoId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load conversation by pair: ${error.message}`);
  }

  return (data as ConversationRow | null) ?? null;
}

export async function getConversationById(
  admin: ReturnType<typeof createAdminClient>,
  conversationId: string
): Promise<ConversationRow | null> {
  const { data, error } = await admin
    .from("conversations")
    .select(
      "id, participant_one_id, participant_two_id, requester_id, status, created_at, updated_at, last_message_at"
    )
    .eq("id", conversationId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load conversation: ${error.message}`);
  }

  return (data as ConversationRow | null) ?? null;
}

export async function consumeMessageRateLimit(
  admin: ReturnType<typeof createAdminClient>,
  senderId: string,
  opts?: { maxMessages?: number; windowSeconds?: number }
): Promise<boolean> {
  const maxMessages = opts?.maxMessages ?? DM_RATE_LIMIT_MAX_MESSAGES;
  const windowSeconds = opts?.windowSeconds ?? DM_RATE_LIMIT_WINDOW_SECONDS;

  const { data, error } = await admin.rpc("dm_consume_rate_limit" as never, {
    p_sender_id: senderId,
    p_max: maxMessages,
    p_window_seconds: windowSeconds,
  });

  if (error) {
    throw new Error(`Rate limit RPC failed: ${error.message}`);
  }

  return Boolean(data);
}

async function getConversationIdsForUser(
  admin: ReturnType<typeof createAdminClient>,
  userId: string
): Promise<string[]> {
  const { data, error } = await admin
    .from("conversation_participants")
    .select("conversation_id")
    .eq("user_id", userId);

  if (error) {
    throw new Error(`Failed to load user conversation ids: ${error.message}`);
  }

  return ((data ?? []) as ConversationIdRow[]).map((row) => row.conversation_id);
}

async function getBlockedUserSetForViewer(
  admin: ReturnType<typeof createAdminClient>,
  viewerId: string,
  otherUserIds: string[]
): Promise<Set<string>> {
  const blockedUsers = new Set<string>();

  if (otherUserIds.length === 0) {
    return blockedUsers;
  }

  const [blockedByViewer, blockedViewer] = await Promise.all([
    admin
      .from("message_user_blocks")
      .select("blocked_id")
      .eq("blocker_id", viewerId)
      .in("blocked_id", otherUserIds),
    admin
      .from("message_user_blocks")
      .select("blocker_id")
      .eq("blocked_id", viewerId)
      .in("blocker_id", otherUserIds),
  ]);

  if (blockedByViewer.error) {
    throw new Error(`Failed to load blocks by viewer: ${blockedByViewer.error.message}`);
  }

  if (blockedViewer.error) {
    throw new Error(`Failed to load blocks against viewer: ${blockedViewer.error.message}`);
  }

  for (const row of (blockedByViewer.data ?? []) as BlockByMeRow[]) {
    blockedUsers.add(row.blocked_id);
  }

  for (const row of (blockedViewer.data ?? []) as BlockMeRow[]) {
    blockedUsers.add(row.blocker_id);
  }

  return blockedUsers;
}

async function getProfilesByUserId(
  admin: ReturnType<typeof createAdminClient>,
  userIds: string[]
): Promise<Map<string, ProfileRow>> {
  const profilesByUserId = new Map<string, ProfileRow>();

  if (userIds.length === 0) {
    return profilesByUserId;
  }

  const { data, error } = await admin
    .from("profiles")
    .select("user_id, display_name, username, avatar_url, role")
    .in("user_id", userIds);

  if (error) {
    throw new Error(`Failed to load profiles for conversations: ${error.message}`);
  }

  for (const profile of (data ?? []) as ProfileRow[]) {
    profilesByUserId.set(profile.user_id, profile);
  }

  return profilesByUserId;
}

async function getLatestMessageByConversationId(
  admin: ReturnType<typeof createAdminClient>,
  conversationIds: string[]
): Promise<Map<string, MessageRow>> {
  const latestByConversationId = new Map<string, MessageRow>();

  if (conversationIds.length === 0) {
    return latestByConversationId;
  }

  const { data, error } = await admin
    .from("messages")
    .select("id, conversation_id, sender_id, body, created_at")
    .in("conversation_id", conversationIds)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load latest conversation messages: ${error.message}`);
  }

  for (const row of (data ?? []) as MessageRow[]) {
    if (!latestByConversationId.has(row.conversation_id)) {
      latestByConversationId.set(row.conversation_id, row);
    }
  }

  return latestByConversationId;
}

function getConversationSortTimestamp(conversation: Pick<ConversationRow, "last_message_at" | "updated_at" | "created_at">): number {
  return new Date(conversation.last_message_at ?? conversation.updated_at ?? conversation.created_at).getTime();
}

export async function listConversationsForUserByStatus(input: {
  admin: ReturnType<typeof createAdminClient>;
  currentUserId: string;
  currentUserRole: MessagingRole;
  status: Exclude<ConversationStatus, "blocked">;
}): Promise<ConversationSummary[]> {
  const { admin, currentUserId, currentUserRole, status } = input;
  const conversationIds = await getConversationIdsForUser(admin, currentUserId);

  if (conversationIds.length === 0) {
    return [];
  }

  const { data, error } = await admin
    .from("conversations")
    .select(
      "id, participant_one_id, participant_two_id, requester_id, status, created_at, updated_at, last_message_at"
    )
    .in("id", conversationIds)
    .eq("status", status);

  if (error) {
    throw new Error(`Failed to load conversations: ${error.message}`);
  }

  const conversationRows = (data ?? []) as ConversationRow[];
  const otherUserIds = conversationRows.map((row) => getOtherParticipantId(row, currentUserId));
  const blockedUsers = await getBlockedUserSetForViewer(admin, currentUserId, otherUserIds);

  const visibleConversationRows = conversationRows.filter(
    (row) => !blockedUsers.has(getOtherParticipantId(row, currentUserId))
  );

  if (visibleConversationRows.length === 0) {
    return [];
  }

  const visibleOtherUserIds = visibleConversationRows.map((row) =>
    getOtherParticipantId(row, currentUserId)
  );

  const [profilesByUserId, rolesByUserId, latestMessagesByConversationId] = await Promise.all([
    getProfilesByUserId(admin, visibleOtherUserIds),
    getMessagingRolesForUsers(admin, visibleOtherUserIds),
    getLatestMessageByConversationId(
      admin,
      visibleConversationRows.map((row) => row.id)
    ),
  ]);

  const summaries = visibleConversationRows.map((conversation) => {
    const otherUserId = getOtherParticipantId(conversation, currentUserId);
    const profile = profilesByUserId.get(otherUserId);
    const latestMessage = latestMessagesByConversationId.get(conversation.id) ?? null;

    return {
      id: conversation.id,
      status: conversation.status,
      requesterId: conversation.requester_id,
      createdAt: conversation.created_at,
      updatedAt: conversation.updated_at,
      lastMessageAt: conversation.last_message_at,
      canAccept:
        conversation.status === "request" &&
        conversation.requester_id !== currentUserId &&
        currentUserRole === "author",
      otherUser: {
        id: otherUserId,
        name:
          profile?.display_name?.trim() ||
          profile?.username?.trim() ||
          (rolesByUserId.get(otherUserId) === "author" ? "Author" : "Reader"),
        username: profile?.username ?? null,
        avatarUrl: profile?.avatar_url ?? null,
        role: rolesByUserId.get(otherUserId) ?? "reader",
      },
      lastMessage: latestMessage
        ? {
            id: latestMessage.id,
            senderId: latestMessage.sender_id,
            body: latestMessage.body,
            createdAt: latestMessage.created_at,
          }
        : null,
    } satisfies ConversationSummary;
  });

  summaries.sort(
    (a, b) =>
      getConversationSortTimestamp({
        last_message_at: b.lastMessageAt,
        updated_at: b.updatedAt,
        created_at: b.createdAt,
      }) -
      getConversationSortTimestamp({
        last_message_at: a.lastMessageAt,
        updated_at: a.updatedAt,
        created_at: a.createdAt,
      })
  );

  return summaries;
}

export async function getConversationDetailForUser(input: {
  admin: ReturnType<typeof createAdminClient>;
  currentUserId: string;
  currentUserRole: MessagingRole;
  conversationId: string;
}): Promise<ConversationDetail | null> {
  const { admin, currentUserId, currentUserRole, conversationId } = input;
  const conversation = await getConversationById(admin, conversationId);

  if (!conversation || !isConversationParticipant(conversation, currentUserId)) {
    return null;
  }

  const otherUserId = getOtherParticipantId(conversation, currentUserId);
  const blocked = await isBlockedBetweenUsers(admin, currentUserId, otherUserId);

  if (blocked.blocked) {
    return null;
  }

  const [profilesByUserId, rolesByUserId, messagesResult] = await Promise.all([
    getProfilesByUserId(admin, [otherUserId]),
    getMessagingRolesForUsers(admin, [otherUserId]),
    admin
      .from("messages")
      .select("id, conversation_id, sender_id, body, created_at")
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: true }),
  ]);

  if (messagesResult.error) {
    throw new Error(`Failed to load conversation messages: ${messagesResult.error.message}`);
  }

  const profile = profilesByUserId.get(otherUserId);
  const conversationSummary: ConversationSummary = {
    id: conversation.id,
    status: conversation.status,
    requesterId: conversation.requester_id,
    createdAt: conversation.created_at,
    updatedAt: conversation.updated_at,
    lastMessageAt: conversation.last_message_at,
    canAccept:
      conversation.status === "request" &&
      conversation.requester_id !== currentUserId &&
      currentUserRole === "author",
    otherUser: {
      id: otherUserId,
      name:
        profile?.display_name?.trim() ||
        profile?.username?.trim() ||
        (rolesByUserId.get(otherUserId) === "author" ? "Author" : "Reader"),
      username: profile?.username ?? null,
      avatarUrl: profile?.avatar_url ?? null,
      role: rolesByUserId.get(otherUserId) ?? "reader",
    },
    lastMessage: null,
  };

  const messages = ((messagesResult.data ?? []) as MessageRow[]).map((message) => ({
    id: message.id,
    senderId: message.sender_id,
    body: message.body,
    createdAt: message.created_at,
  }));

  if (messages.length > 0) {
    const latest = messages[messages.length - 1];
    conversationSummary.lastMessage = {
      id: latest.id,
      senderId: latest.senderId,
      body: latest.body,
      createdAt: latest.createdAt,
    };
  }

  return {
    conversation: conversationSummary,
    messages,
  };
}
