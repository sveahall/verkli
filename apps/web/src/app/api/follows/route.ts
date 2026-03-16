import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  apiError,
  E_ALREADY_FOLLOWING,
  E_CANNOT_FOLLOW_SELF,
  E_FOLLOW_CREATE_FAILED,
  E_FOLLOW_LIST_FAILED,
  E_FOLLOW_REMOVE_FAILED,
  E_INVALID_FOLLOWEE_ID,
  E_INVALID_JSON,
  E_NOT_AUTHENTICATED,
  E_RATE_LIMIT_EXCEEDED,
  E_VALIDATION_FAILED,
} from "@/lib/api-errors";
import { createNotification } from "@/lib/notifications/server";
import { createPerUserRateLimiter } from "@/lib/rate-limit";

const followRateLimiter = createPerUserRateLimiter({ maxPerMinute: 30 });

const followBodySchema = z.object({
  followeeId: z.string().uuid("Invalid followee ID"),
});

type FollowRow = {
  followee_id: string;
  created_at: string;
};

type ProfileRow = {
  user_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

function mapFollowingRow(follow: FollowRow, profile: ProfileRow | undefined) {
  const displayName = profile?.display_name?.trim();
  const username = profile?.username?.trim();

  return {
    userId: follow.followee_id,
    createdAt: follow.created_at,
    profile: {
      name: displayName || username || "Author",
      username: username || null,
      avatarUrl: profile?.avatar_url ?? null,
    },
  };
}

async function parseFolloweeIdFromDeleteRequest(request: Request): Promise<string | null> {
  const url = new URL(request.url);
  const fromQuery = url.searchParams.get("followeeId");
  if (fromQuery) return fromQuery;

  try {
    const json = await request.json();
    const parsed = followBodySchema.safeParse(json);
    return parsed.success ? parsed.data.followeeId : null;
  } catch {
    return null;
  }
}

async function syncLegacyAuthorFollowersInsert(
  supabase: Awaited<ReturnType<typeof createClient>>,
  followerId: string,
  followeeId: string
) {
  const { error } = await supabase
    .from("author_followers")
    .upsert(
      {
        author_id: followeeId,
        follower_id: followerId,
      },
      {
        onConflict: "author_id,follower_id",
        ignoreDuplicates: true,
      }
    );

  if (error) {
    console.error("[follows] legacy author_followers insert failed", {
      followerId,
      followeeId,
      message: error.message,
      code: error.code,
    });
  }
}

async function syncLegacyAuthorFollowersDelete(
  supabase: Awaited<ReturnType<typeof createClient>>,
  followerId: string,
  followeeId: string
) {
  const { error } = await supabase
    .from("author_followers")
    .delete()
    .eq("author_id", followeeId)
    .eq("follower_id", followerId);

  if (error) {
    console.error("[follows] legacy author_followers delete failed", {
      followerId,
      followeeId,
      message: error.message,
      code: error.code,
    });
  }
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError(E_NOT_AUTHENTICATED, 401);
  }

  const { data: rows, error: followsError } = await supabase
    .from("follows")
    .select("followee_id, created_at")
    .eq("follower_id", user.id)
    .order("created_at", { ascending: false });

  if (followsError) {
    console.error("[follows] list failed", {
      userId: user.id,
      message: followsError.message,
      code: followsError.code,
    });
    return apiError(E_FOLLOW_LIST_FAILED, 500);
  }

  const follows = (rows ?? []) as FollowRow[];
  const followeeIds = Array.from(new Set(follows.map((row) => row.followee_id)));

  const { data: profiles, error: profilesError } =
    followeeIds.length > 0
      ? await supabase
          .from("profiles")
          .select("user_id, display_name, username, avatar_url")
          .in("user_id", followeeIds)
      : { data: [] as ProfileRow[], error: null };

  if (profilesError) {
    console.error("[follows] profile lookup failed", {
      userId: user.id,
      message: profilesError.message,
      code: profilesError.code,
    });
    return apiError(E_FOLLOW_LIST_FAILED, 500);
  }

  const profilesByUserId = new Map(
    ((profiles ?? []) as ProfileRow[]).map((profile) => [profile.user_id, profile] as const)
  );

  return NextResponse.json({
    following: follows.map((row) => mapFollowingRow(row, profilesByUserId.get(row.followee_id))),
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError(E_NOT_AUTHENTICATED, 401);
  }

  const rl = await followRateLimiter.check(user.id);
  if (!rl.allowed) {
    return apiError(E_RATE_LIMIT_EXCEEDED, 429);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(E_INVALID_JSON, 400);
  }

  const parsed = followBodySchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(E_VALIDATION_FAILED, 400);
  }

  const { followeeId } = parsed.data;
  if (followeeId === user.id) {
    return apiError(E_CANNOT_FOLLOW_SELF, 400);
  }

  const { error: insertError } = await supabase.from("follows").insert({
    follower_id: user.id,
    followee_id: followeeId,
  });

  if (insertError) {
    if (insertError.code === "23505") {
      return apiError(E_ALREADY_FOLLOWING, 409);
    }
    if (insertError.code === "23514") {
      return apiError(E_CANNOT_FOLLOW_SELF, 400);
    }
    if (insertError.code === "23503") {
      return apiError(E_INVALID_FOLLOWEE_ID, 400);
    }

    console.error("[follows] follow failed", {
      followerId: user.id,
      followeeId,
      message: insertError.message,
      code: insertError.code,
    });
    return apiError(E_FOLLOW_CREATE_FAILED, 500);
  }

  await syncLegacyAuthorFollowersInsert(supabase, user.id, followeeId);

  try {
    await createNotification(supabase, {
      userId: followeeId,
      type: "new_follower",
      title: "New follower",
      actorId: user.id,
      entityId: user.id,
      entityType: "user",
    });
  } catch {
    // non-critical — don't fail the follow
  }

  return NextResponse.json({ ok: true, followeeId });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError(E_NOT_AUTHENTICATED, 401);
  }

  const followeeId = await parseFolloweeIdFromDeleteRequest(request);
  if (!followeeId || !z.string().uuid().safeParse(followeeId).success) {
    return apiError(E_INVALID_FOLLOWEE_ID, 400);
  }

  const { error: deleteError } = await supabase
    .from("follows")
    .delete()
    .eq("follower_id", user.id)
    .eq("followee_id", followeeId);

  if (deleteError) {
    console.error("[follows] unfollow failed", {
      followerId: user.id,
      followeeId,
      message: deleteError.message,
      code: deleteError.code,
    });
    return apiError(E_FOLLOW_REMOVE_FAILED, 500);
  }

  await syncLegacyAuthorFollowersDelete(supabase, user.id, followeeId);

  return NextResponse.json({ ok: true, followeeId });
}
