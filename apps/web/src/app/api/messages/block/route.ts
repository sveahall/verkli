import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  apiError,
  E_FORBIDDEN,
  E_INVALID_JSON,
  E_MESSAGE_BLOCK_FAILED,
  E_NOT_AUTHENTICATED,
  E_VALIDATION_FAILED,
} from "@/lib/api-errors";
import {
  getMessagingRoleForUser,
  toConversationPair,
} from "@/lib/messages/server";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type BlockBody = {
  targetUserId?: unknown;
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError(E_NOT_AUTHENTICATED, 401);
  }

  let payload: BlockBody;
  try {
    payload = (await request.json()) as BlockBody;
  } catch {
    return apiError(E_INVALID_JSON, 400);
  }

  const targetUserId = typeof payload.targetUserId === "string" ? payload.targetUserId.trim() : "";
  if (!UUID_RE.test(targetUserId) || targetUserId === user.id) {
    return apiError(E_VALIDATION_FAILED, 400);
  }

  const admin = createAdminClient();

  try {
    const currentUserRole = await getMessagingRoleForUser(admin, user.id);
    if (currentUserRole !== "author") {
      return apiError(E_FORBIDDEN, 403);
    }

    const { error: blockError } = await admin.from("message_user_blocks").upsert(
      {
        blocker_id: user.id,
        blocked_id: targetUserId,
      },
      {
        onConflict: "blocker_id,blocked_id",
        ignoreDuplicates: true,
      }
    );

    if (blockError) {
      console.error("[messages.block] block upsert failed", {
        userId: user.id,
        targetUserId,
        message: blockError.message,
        code: blockError.code,
      });
      return apiError(E_MESSAGE_BLOCK_FAILED, 500);
    }

    const pair = toConversationPair(user.id, targetUserId);
    const { error: updateError } = await admin
      .from("conversations")
      .update({
        status: "blocked",
        blocked_at: new Date().toISOString(),
        blocked_by: user.id,
      })
      .eq("participant_one_id", pair.participantOneId)
      .eq("participant_two_id", pair.participantTwoId);

    if (updateError) {
      console.error("[messages.block] conversation update failed", {
        userId: user.id,
        targetUserId,
        message: updateError.message,
        code: updateError.code,
      });
      return apiError(E_MESSAGE_BLOCK_FAILED, 500);
    }

    return NextResponse.json({ ok: true, blockedUserId: targetUserId });
  } catch (error) {
    console.error("[messages.block] unexpected error", {
      userId: user.id,
      targetUserId,
      message: error instanceof Error ? error.message : String(error),
    });
    return apiError(E_MESSAGE_BLOCK_FAILED, 500);
  }
}
