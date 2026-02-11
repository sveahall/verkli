import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  apiError,
  E_NOT_AUTHENTICATED,
  E_NOTIFICATION_NOT_FOUND,
  E_NOTIFICATION_UPDATE_FAILED,
  E_VALIDATION_FAILED,
} from "@/lib/api-errors";
import { type NotificationType } from "@/lib/notifications/server";

const paramsSchema = z.object({
  id: z.string().uuid("Invalid notification ID"),
});

const NOTIFICATION_SELECT =
  "id, user_id, type, title, body, data, read, actor_id, entity_id, entity_type, created_at";

type NotificationRow = {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  read: boolean;
  actor_id: string | null;
  entity_id: string | null;
  entity_type: string | null;
  created_at: string;
};

function mapNotification(row: NotificationRow) {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    title: row.title,
    body: row.body,
    data: row.data ?? {},
    read: row.read,
    actorId: row.actor_id,
    entityId: row.entity_id,
    entityType: row.entity_type,
    createdAt: row.created_at,
  };
}

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return apiError(E_VALIDATION_FAILED, 400);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError(E_NOT_AUTHENTICATED, 401);
  }

  const notificationId = parsedParams.data.id;
  const { data, error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("id", notificationId)
    .eq("user_id", user.id)
    .select(NOTIFICATION_SELECT)
    .maybeSingle();

  if (error) {
    console.error("[notifications] update failed", {
      userId: user.id,
      notificationId,
      message: error.message,
      code: error.code,
    });
    return apiError(E_NOTIFICATION_UPDATE_FAILED, 500);
  }

  if (!data) {
    return apiError(E_NOTIFICATION_NOT_FOUND, 404);
  }

  return NextResponse.json({
    notification: mapNotification(data as NotificationRow),
  });
}
