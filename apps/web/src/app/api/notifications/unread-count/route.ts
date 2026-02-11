import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  apiError,
  E_NOT_AUTHENTICATED,
  E_NOTIFICATION_LOAD_FAILED,
} from "@/lib/api-errors";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError(E_NOT_AUTHENTICATED, 401);
  }

  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("read", false);

  if (error) {
    console.error("[notifications] unread count failed", {
      userId: user.id,
      message: error.message,
      code: error.code,
    });
    return apiError(E_NOTIFICATION_LOAD_FAILED, 500);
  }

  return NextResponse.json({ unreadCount: count ?? 0 });
}
