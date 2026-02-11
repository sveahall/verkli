import type { createClient } from "@/lib/supabase/server";

type CreateNotificationOpts = {
  userId: string;
  type: string;
  title: string;
  body?: string;
  actorId?: string;
  entityId?: string;
  entityType?: string;
  data?: Record<string, unknown>;
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
      body: opts.body ?? null,
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
