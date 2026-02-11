import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  apiError,
  E_NOT_AUTHENTICATED,
  E_NOTIFICATION_UPDATE_FAILED,
} from "@/lib/api-errors";

type UpdatedNotificationIdRow = {
  id: string;
};

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError(E_NOT_AUTHENTICATED, 401);
  }

  const { data, error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("user_id", user.id)
    .eq("read", false)
    .select("id");

  if (error) {
    console.error("[notifications] mark all read failed", {
      userId: user.id,
      message: error.message,
      code: error.code,
    });
    return apiError(E_NOTIFICATION_UPDATE_FAILED, 500);
  }

  return NextResponse.json({
    updated: ((data ?? []) as UpdatedNotificationIdRow[]).length,
  });
}
