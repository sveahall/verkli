import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  apiError,
  E_NOT_AUTHENTICATED,
  E_CLUBS_FEATURE_DISABLED,
  E_CLUB_CREATE_FAILED,
  E_INVALID_JSON,
  E_VALIDATION_FAILED,
  E_RATE_LIMIT_EXCEEDED,
} from "@/lib/api-errors";
import { isBookClubsEnabled } from "@/lib/flags";
import { createPerUserRateLimiter } from "@/lib/rate-limit";

const clubRateLimiter = createPerUserRateLimiter({ maxPerMinute: 5 });

const createClubBodySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(2000).optional(),
  is_public: z.boolean().default(true),
  max_members: z.number().int().min(2).max(500).default(50),
});

type ClubRow = {
  id: string;
  name: string;
  description: string | null;
  cover_url: string | null;
  is_public: boolean;
  max_members: number;
  current_book_id: string | null;
  creator_id: string;
  created_at: string;
};

const CLUB_SELECT =
  "id, name, description, cover_url, is_public, max_members, current_book_id, creator_id, created_at";

export async function GET() {
  if (!isBookClubsEnabled()) {
    return apiError(E_CLUBS_FEATURE_DISABLED, 403);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError(E_NOT_AUTHENTICATED, 401);
  }

  const { data, error } = await supabase
    .from("book_clubs" as never)
    .select(CLUB_SELECT)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[book-clubs] list failed", {
      userId: user.id,
      message: (error as { message: string }).message,
      code: (error as { code: string }).code,
    });
    return apiError(E_CLUB_CREATE_FAILED, 500);
  }

  const clubs = (data ?? []) as ClubRow[];

  return NextResponse.json({ clubs });
}

export async function POST(request: Request) {
  if (!isBookClubsEnabled()) {
    return apiError(E_CLUBS_FEATURE_DISABLED, 403);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError(E_NOT_AUTHENTICATED, 401);
  }

  const rl = await clubRateLimiter.check(user.id);
  if (!rl.allowed) {
    return apiError(E_RATE_LIMIT_EXCEEDED, 429);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(E_INVALID_JSON, 400);
  }

  const parsed = createClubBodySchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(E_VALIDATION_FAILED, 400);
  }

  const { name, description, is_public, max_members } = parsed.data;

  const { data: club, error: clubError } = await supabase
    .from("book_clubs" as never)
    .insert({
      name,
      description: description ?? null,
      is_public,
      max_members,
      creator_id: user.id,
    } as never)
    .select(CLUB_SELECT)
    .single();

  if (clubError || !club) {
    console.error("[book-clubs] create failed", {
      userId: user.id,
      message: (clubError as { message: string } | null)?.message,
      code: (clubError as { code: string } | null)?.code,
    });
    return apiError(E_CLUB_CREATE_FAILED, 500);
  }

  const created = club as ClubRow;

  const { error: memberError } = await supabase
    .from("book_club_members" as never)
    .insert({
      club_id: created.id,
      user_id: user.id,
      role: "owner",
    } as never);

  if (memberError) {
    console.error("[book-clubs] owner member insert failed", {
      clubId: created.id,
      userId: user.id,
      message: (memberError as { message: string }).message,
      code: (memberError as { code: string }).code,
    });
    return apiError(E_CLUB_CREATE_FAILED, 500);
  }

  return NextResponse.json({ club: created }, { status: 201 });
}
