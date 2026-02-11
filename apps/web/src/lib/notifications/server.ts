import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export const NOTIFICATION_TYPES = [
  "comment_reply",
  "new_follower",
  "book_published",
  "purchase",
  "review",
  "newsletter",
  "poll",
  "club_event",
  "system",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

const createNotificationSchema = z.object({
  userId: z.string().uuid("Invalid userId"),
  type: z.enum(NOTIFICATION_TYPES),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(2000),
  actorId: z.string().uuid("Invalid actorId").optional(),
  entityId: z.string().trim().min(1).max(200).optional(),
  entityType: z.string().trim().min(1).max(100).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});

export type CreateNotificationInput = z.input<typeof createNotificationSchema>;

export type NotificationRow = {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown>;
  read: boolean;
  actor_id: string | null;
  entity_id: string | null;
  entity_type: string | null;
  created_at: string;
};

const NOTIFICATION_SELECT =
  "id, user_id, type, title, body, data, read, actor_id, entity_id, entity_type, created_at";

export async function createNotification(
  input: CreateNotificationInput
): Promise<NotificationRow> {
  const parsed = createNotificationSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error("[notifications] invalid create payload");
  }

  const supabase = await createClient();
  const payload = parsed.data;

  const { data, error } = await supabase
    .from("notifications")
    .insert({
      user_id: payload.userId,
      type: payload.type,
      title: payload.title,
      body: payload.body,
      actor_id: payload.actorId ?? null,
      entity_id: payload.entityId ?? null,
      entity_type: payload.entityType ?? null,
      data: payload.data ?? {},
    })
    .select(NOTIFICATION_SELECT)
    .single();

  if (error) {
    console.error("[notifications] create failed", {
      userId: payload.userId,
      type: payload.type,
      message: error.message,
      code: error.code,
    });
    throw new Error("[notifications] create failed");
  }

  return data as NotificationRow;
}
