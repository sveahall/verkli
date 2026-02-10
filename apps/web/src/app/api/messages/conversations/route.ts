import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  apiError,
  E_FORBIDDEN,
  E_INVALID_JSON,
  E_MESSAGE_BLOCKED,
  E_MESSAGE_CONVERSATION_CREATE_FAILED,
  E_MESSAGE_INVALID_RECIPIENT,
  E_NOT_AUTHENTICATED,
  E_VALIDATION_FAILED,
} from "@/lib/api-errors";
import {
  type ConversationStatus,
  getConversationByPair,
  getMessagingRoleForUser,
  isBlockedBetweenUsers,
  resolveNewConversationStatus,
  toConversationPair,
} from "@/lib/messages/server";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CreateConversationBody = {
  recipientId?: unknown;
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError(E_NOT_AUTHENTICATED, 401);
  }

  let body: CreateConversationBody;
  try {
    body = (await request.json()) as CreateConversationBody;
  } catch {
    return apiError(E_INVALID_JSON, 400);
  }

  const recipientId = typeof body.recipientId === "string" ? body.recipientId.trim() : "";
  if (!UUID_RE.test(recipientId) || recipientId === user.id) {
    return apiError(E_VALIDATION_FAILED, 400);
  }

  const admin = createAdminClient();

  try {
    const { data: recipientProfile, error: recipientError } = await admin
      .from("profiles")
      .select("user_id")
      .eq("user_id", recipientId)
      .maybeSingle();

    if (recipientError) {
      console.error("[messages.conversations] recipient lookup failed", {
        userId: user.id,
        recipientId,
        message: recipientError.message,
        code: recipientError.code,
      });
      return apiError(E_MESSAGE_CONVERSATION_CREATE_FAILED, 500);
    }

    if (!recipientProfile) {
      return apiError(E_MESSAGE_INVALID_RECIPIENT, 404);
    }

    const [senderRole, recipientRole] = await Promise.all([
      getMessagingRoleForUser(admin, user.id),
      getMessagingRoleForUser(admin, recipientId),
    ]);

    // Rule: reader can only initiate DM towards authors.
    if (senderRole === "reader" && recipientRole !== "author") {
      return apiError(E_FORBIDDEN, 403);
    }

    const pair = toConversationPair(user.id, recipientId);
    const blocked = await isBlockedBetweenUsers(admin, user.id, recipientId);
    if (blocked.blocked) {
      return apiError(E_MESSAGE_BLOCKED, 403);
    }

    const existing = await getConversationByPair(admin, pair.participantOneId, pair.participantTwoId);
    if (existing) {
      if (existing.status === "blocked") {
        return apiError(E_MESSAGE_BLOCKED, 403);
      }

      return NextResponse.json({
        conversation: {
          id: existing.id,
          status: existing.status,
          requesterId: existing.requester_id,
        },
        alreadyExists: true,
      });
    }

    const status: ConversationStatus = resolveNewConversationStatus(senderRole, recipientRole);

    const { data: inserted, error: insertError } = await admin
      .from("conversations")
      .insert({
        participant_one_id: pair.participantOneId,
        participant_two_id: pair.participantTwoId,
        created_by: user.id,
        requester_id: user.id,
        status,
      })
      .select("id, status, requester_id")
      .single();

    if (insertError || !inserted) {
      console.error("[messages.conversations] create failed", {
        userId: user.id,
        recipientId,
        message: insertError?.message,
        code: insertError?.code,
      });
      return apiError(E_MESSAGE_CONVERSATION_CREATE_FAILED, 500);
    }

    const row = inserted as { id: string; status: ConversationStatus; requester_id: string };

    return NextResponse.json(
      {
        conversation: {
          id: row.id,
          status: row.status,
          requesterId: row.requester_id,
        },
        alreadyExists: false,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[messages.conversations] unexpected error", {
      userId: user.id,
      recipientId,
      message: error instanceof Error ? error.message : String(error),
    });
    return apiError(E_MESSAGE_CONVERSATION_CREATE_FAILED, 500);
  }
}
