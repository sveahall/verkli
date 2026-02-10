import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  apiError,
  E_FORBIDDEN,
  E_MESSAGE_BLOCKED,
  E_MESSAGE_CONVERSATION_NOT_FOUND,
  E_MESSAGE_REQUEST_ACCEPT_FAILED,
  E_NOT_AUTHENTICATED,
  E_VALIDATION_FAILED,
} from "@/lib/api-errors";
import {
  getConversationById,
  getMessagingRoleForUser,
  getOtherParticipantId,
  isBlockedBetweenUsers,
  isConversationParticipant,
} from "@/lib/messages/server";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const resolvedParams = await params;
  const conversationId = resolvedParams.conversationId;

  if (!UUID_RE.test(conversationId)) {
    return apiError(E_VALIDATION_FAILED, 400);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError(E_NOT_AUTHENTICATED, 401);
  }

  const admin = createAdminClient();

  try {
    const currentUserRole = await getMessagingRoleForUser(admin, user.id);
    if (currentUserRole !== "author") {
      return apiError(E_FORBIDDEN, 403);
    }

    const conversation = await getConversationById(admin, conversationId);
    if (!conversation) {
      return apiError(E_MESSAGE_CONVERSATION_NOT_FOUND, 404);
    }

    if (!isConversationParticipant(conversation, user.id)) {
      return apiError(E_FORBIDDEN, 403);
    }

    if (conversation.status !== "request") {
      return apiError(E_VALIDATION_FAILED, 400);
    }

    if (conversation.requester_id === user.id) {
      return apiError(E_FORBIDDEN, 403);
    }

    const otherParticipantId = getOtherParticipantId(conversation, user.id);
    const blocked = await isBlockedBetweenUsers(admin, user.id, otherParticipantId);
    if (blocked.blocked) {
      return apiError(E_MESSAGE_BLOCKED, 403);
    }

    const { data: updated, error: updateError } = await admin
      .from("conversations")
      .update({
        status: "accepted",
        accepted_at: new Date().toISOString(),
        blocked_at: null,
        blocked_by: null,
      })
      .eq("id", conversation.id)
      .select("id, status, requester_id")
      .single();

    if (updateError || !updated) {
      console.error("[messages.requests.accept] update failed", {
        userId: user.id,
        conversationId,
        message: updateError?.message,
        code: updateError?.code,
      });
      return apiError(E_MESSAGE_REQUEST_ACCEPT_FAILED, 500);
    }

    const row = updated as { id: string; status: string; requester_id: string };

    return NextResponse.json({
      ok: true,
      conversation: {
        id: row.id,
        status: row.status,
        requesterId: row.requester_id,
      },
    });
  } catch (error) {
    console.error("[messages.requests.accept] unexpected error", {
      userId: user.id,
      conversationId,
      message: error instanceof Error ? error.message : String(error),
    });
    return apiError(E_MESSAGE_REQUEST_ACCEPT_FAILED, 500);
  }
}
