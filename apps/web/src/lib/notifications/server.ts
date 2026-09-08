import type { createClient } from "@/lib/supabase/server";

import type { Json } from "@/lib/supabase/types";

type CreateNotificationOpts = {
  userId: string;
  type: string;
  title: string;
  body?: string;
  actorId?: string;
  entityId?: string;
  entityType?: string;
  /** `Json`, not Record<string, unknown>: this lands in a jsonb column and
   *  `unknown` values are not serialisable by construction. */
  data?: Json;
};

export async function createNotification(
  supabase: Awaited<ReturnType<typeof createClient>>,
  opts: CreateNotificationOpts
) {
  const { data, error } = await supabase
    .from("notifications")
    .insert({
      user_id: opts.userId,
      type: opts.type,
      title: opts.title,
      // `notifications.body` is NOT NULL. This passed `null` whenever body was
      // omitted, so every such insert failed on the constraint and the
      // notification was never created.
      body: opts.body ?? "",
      actor_id: opts.actorId ?? null,
      entity_id: opts.entityId ?? null,
      entity_type: opts.entityType ?? null,
      data: opts.data ?? {},
    })
    .select("id")
    .single();

  if (error) {
    console.error("[notifications] create failed", {
      userId: opts.userId,
      type: opts.type,
      message: error.message,
      code: error.code,
    });
    throw error;
  }

  return { ok: true, id: data.id };
}
