import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  apiError,
  E_FORBIDDEN,
  E_INVALID_JSON,
  E_MESSAGE_BLOCKED,
  E_MESSAGE_CONVERSATION_NOT_FOUND,
  E_MESSAGE_SEND_FAILED,
  E_NOT_AUTHENTICATED,
  E_RATE_LIMIT_EXCEEDED,
  E_VALIDATION_FAILED,
} from "@/lib/api-errors";
import {
  DM_MAX_BODY_LENGTH,
  canSendInConversation,
  consumeMessageRateLimit,
  getConversationById,
  getOtherParticipantId,
  isBlockedBetweenUsers,
  isConversationParticipant,
} from "@/lib/messages/server";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SendMessageBody = {
  conversationId?: unknown;
  body?: unknown;
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError(E_NOT_AUTHENTICATED, 401);
  }

  let payload: SendMessageBody;
  try {
    payload = (await request.json()) as SendMessageBody;
  } catch {
    return apiError(E_INVALID_JSON, 400);
  }

  const conversationId = typeof payload.conversationId === "string" ? payload.conversationId.trim() : "";
  const body = typeof payload.body === "string" ? payload.body.trim() : "";

  if (!UUID_RE.test(conversationId) || body.length < 1 || body.length > DM_MAX_BODY_LENGTH) {
    return apiError(E_VALIDATION_FAILED, 400);
  }

  const admin = createAdminClient();

  try {
    const conversation = await getConversationById(admin, conversationId);
    if (!conversation) {
      return apiError(E_MESSAGE_CONVERSATION_NOT_FOUND, 404);
    }

    if (!isConversationParticipant(conversation, user.id)) {
      return apiError(E_FORBIDDEN, 403);
    }

    const otherParticipantId = getOtherParticipantId(conversation, user.id);
    const blocked = await isBlockedBetweenUsers(admin, user.id, otherParticipantId);
    if (blocked.blocked || conversation.status === "blocked") {
      return apiError(E_MESSAGE_BLOCKED, 403);
    }

    if (!canSendInConversation(conversation, user.id)) {
      return apiError(E_FORBIDDEN, 403);
    }

    const allowed = await consumeMessageRateLimit(admin, user.id);
    if (!allowed) {
      return apiError(E_RATE_LIMIT_EXCEEDED, 429);
    }

    const { data: inserted, error: insertError } = await admin
      .from("messages")
      .insert({
        conversation_id: conversation.id,
        sender_id: user.id,
        body,
      })
      .select("id, conversation_id, sender_id, body, created_at")
      .single();

    if (insertError || !inserted) {
      console.error("[messages.send] insert failed", {
        userId: user.id,
        conversationId,
        message: insertError?.message,
        code: insertError?.code,
      });
      return apiError(E_MESSAGE_SEND_FAILED, 500);
    }

    const row = inserted as {
      id: string;
      conversation_id: string;
      sender_id: string;
      body: string;
      created_at: string;
    };

    return NextResponse.json(
      {
        message: {
          id: row.id,
          conversationId: row.conversation_id,
          senderId: row.sender_id,
          body: row.body,
          createdAt: row.created_at,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[messages.send] unexpected error", {
      userId: user.id,
      conversationId,
      message: error instanceof Error ? error.message : String(error),
    });
    return apiError(E_MESSAGE_SEND_FAILED, 500);
  }
}
