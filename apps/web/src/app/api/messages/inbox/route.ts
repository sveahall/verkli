import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  apiError,
  E_MESSAGE_LIST_FAILED,
  E_NOT_AUTHENTICATED,
} from "@/lib/api-errors";
import {
  getMessagingRoleForUser,
  listConversationsForUserByStatus,
} from "@/lib/messages/server";

export async function GET() {
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
    const conversations = await listConversationsForUserByStatus({
      admin,
      currentUserId: user.id,
      currentUserRole,
      status: "accepted",
    });

    return NextResponse.json({
      viewerId: user.id,
      conversations,
    });
  } catch (error) {
    console.error("[messages.inbox] load failed", {
      userId: user.id,
      message: error instanceof Error ? error.message : String(error),
    });
    return apiError(E_MESSAGE_LIST_FAILED, 500);
  }
}
