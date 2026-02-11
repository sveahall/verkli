import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  apiError,
  E_NOT_AUTHENTICATED,
  E_NOTIFICATION_LOAD_FAILED,
  E_VALIDATION_FAILED,
} from "@/lib/api-errors";
import { NOTIFICATION_TYPES, type NotificationType } from "@/lib/notifications/server";

const NOTIFICATION_SELECT =
  "id, user_id, type, title, body, data, read, actor_id, entity_id, entity_type, created_at";

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  type: z.enum(NOTIFICATION_TYPES).optional(),
  category: z
    .enum(["all", "social", "publishing", "commerce", "engagement", "system"])
    .optional(),
});

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

const CATEGORY_FILTERS: Record<
  Exclude<z.infer<typeof listQuerySchema>["category"], undefined | "all">,
  NotificationType[]
> = {
  social: ["comment_reply", "new_follower"],
  publishing: ["book_published", "review"],
  commerce: ["purchase"],
  engagement: ["newsletter", "poll", "club_event"],
  system: ["system"],
};

function resolveTypeFilter(
  query: z.infer<typeof listQuerySchema>
): NotificationType[] | null {
  if (query.type) {
    return [query.type];
  }

  if (!query.category || query.category === "all") {
    return null;
  }

  return CATEGORY_FILTERS[query.category];
}

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

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError(E_NOT_AUTHENTICATED, 401);
  }

  const { searchParams } = new URL(request.url);
  const parsedQuery = listQuerySchema.safeParse({
    page: searchParams.get("page") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
    type: searchParams.get("type") ?? undefined,
    category: searchParams.get("category") ?? undefined,
  });

  if (!parsedQuery.success) {
    return apiError(E_VALIDATION_FAILED, 400);
  }

  const { page, limit } = parsedQuery.data;
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const typeFilter = resolveTypeFilter(parsedQuery.data);

  let query = supabase
    .from("notifications")
    .select(NOTIFICATION_SELECT, { count: "exact" })
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (typeFilter && typeFilter.length === 1) {
    query = query.eq("type", typeFilter[0]);
  } else if (typeFilter && typeFilter.length > 1) {
    query = query.in("type", typeFilter);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error("[notifications] list failed", {
      userId: user.id,
      message: error.message,
      code: error.code,
    });
    return apiError(E_NOTIFICATION_LOAD_FAILED, 500);
  }

  const rows = (data ?? []) as NotificationRow[];
  const totalCount = count ?? rows.length;
  const hasMore = from + rows.length < totalCount;

  return NextResponse.json({
    notifications: rows.map(mapNotification),
    page,
    limit,
    totalCount,
    hasMore,
  });
}
