import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  apiError,
  E_MESSAGE_CONVERSATION_NOT_FOUND,
  E_MESSAGE_LIST_FAILED,
  E_NOT_AUTHENTICATED,
  E_VALIDATION_FAILED,
} from "@/lib/api-errors";
import {
  getConversationDetailForUser,
  getMessagingRoleForUser,
} from "@/lib/messages/server";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
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
    const detail = await getConversationDetailForUser({
      admin,
      currentUserId: user.id,
      currentUserRole,
      conversationId,
    });

    if (!detail) {
      return apiError(E_MESSAGE_CONVERSATION_NOT_FOUND, 404);
    }

    return NextResponse.json({
      viewerId: user.id,
      conversation: detail.conversation,
      messages: detail.messages,
    });
  } catch (error) {
    console.error("[messages.conversation] load failed", {
      userId: user.id,
      conversationId,
      message: error instanceof Error ? error.message : String(error),
    });
    return apiError(E_MESSAGE_LIST_FAILED, 500);
  }
}
