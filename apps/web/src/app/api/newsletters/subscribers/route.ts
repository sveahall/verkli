import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isNewslettersEnabled } from "@/lib/flags";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import {
  apiError,
  E_NEWSLETTERS_FEATURE_DISABLED,
  E_NEWSLETTER_SUBSCRIBERS_LOAD_FAILED,
} from "@/lib/api-errors";

type SubscriptionRow = {
  id: string;
  subscriber_user_id: string;
  status: string;
  subscribed_at: string;
};

type ProfileRow = {
  user_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

export async function GET() {
  if (!isNewslettersEnabled()) {
    return apiError(E_NEWSLETTERS_FEATURE_DISABLED, 403);
  }

  const { user, response } = await requireAuthorRoleForApi();
  if (response) return response;

  const supabase = await createClient();

  const { data: subscriptions, error } = await supabase
    .from("newsletter_subscriptions" as never)
    .select("id, subscriber_user_id, status, subscribed_at")
    .eq("author_id", user.id)
    .eq("status", "active")
    .order("subscribed_at", { ascending: false });

  if (error) {
    console.error("[newsletters] subscribers list failed", {
      userId: user.id,
      message: error.message,
      code: error.code,
    });
    return apiError(E_NEWSLETTER_SUBSCRIBERS_LOAD_FAILED, 500);
  }

  const rows = (subscriptions ?? []) as SubscriptionRow[];
  const subscriberIds = rows.map((r) => r.subscriber_user_id);

  // Fetch profiles
  let profilesByUserId = new Map<string, ProfileRow>();
  if (subscriberIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, display_name, username, avatar_url")
      .in("user_id", subscriberIds);

    profilesByUserId = new Map(
      ((profiles ?? []) as ProfileRow[]).map((p) => [p.user_id, p] as const)
    );
  }

  const subscribers = rows.map((row) => {
    const profile = profilesByUserId.get(row.subscriber_user_id);
    return {
      id: row.id,
      userId: row.subscriber_user_id,
      subscribedAt: row.subscribed_at,
      status: row.status,
      profile: {
        name: profile?.display_name || profile?.username || "Anonym",
        username: profile?.username ?? null,
        avatarUrl: profile?.avatar_url ?? null,
      },
    };
  });

  return NextResponse.json({ subscribers });
}
