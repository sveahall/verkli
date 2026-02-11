import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  apiError,
  E_NOT_AUTHENTICATED,
  E_NOTIFICATION_NOT_FOUND,
  E_NOTIFICATION_UPDATE_FAILED,
} from "@/lib/api-errors";

const paramsSchema = z.object({
  id: z.string().uuid("Invalid notification ID"),
});

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const parsedParams = paramsSchema.safeParse(resolvedParams);
  if (!parsedParams.success) {
    return apiError(E_NOTIFICATION_NOT_FOUND, 400);
  }

  const { id } = parsedParams.data;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError(E_NOT_AUTHENTICATED, 401);
  }

  const { data: updated, error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[notifications] update failed", {
      notificationId: id,
      userId: user.id,
      message: error.message,
      code: error.code,
    });
    return apiError(E_NOTIFICATION_UPDATE_FAILED, 500);
  }

  if (!updated) {
    return apiError(E_NOTIFICATION_NOT_FOUND, 404);
  }

  return NextResponse.json({ ok: true });
}
