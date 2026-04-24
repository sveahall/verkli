import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  apiError,
  E_NOT_AUTHENTICATED,
  E_CLUBS_FEATURE_DISABLED,
  E_CLUB_NOT_FOUND,
  E_CLUB_UPDATE_FAILED,
  E_CLUB_DELETE_FAILED,
  E_FORBIDDEN,
  E_INVALID_JSON,
  E_VALIDATION_FAILED,
} from "@/lib/api-errors";
import { isBookClubsEnabled } from "@/lib/flags";

const paramsSchema = z.object({
  id: z.string().uuid("Invalid club ID"),
});

const updateClubBodySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(2000).optional(),
  is_public: z.boolean().optional(),
  max_members: z.number().int().min(2).max(500).optional(),
  current_book_id: z.string().uuid().nullable().optional(),
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

type MemberRow = {
  user_id: string;
  role: string;
  joined_at: string;
  display_name: string | null;
  avatar_url: string | null;
};

const CLUB_SELECT =
  "id, name, description, cover_url, is_public, max_members, current_book_id, creator_id, created_at";

const MEMBER_SELECT = "user_id, role, joined_at, profiles:user_id(display_name, avatar_url)";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isBookClubsEnabled()) {
    return apiError(E_CLUBS_FEATURE_DISABLED, 403);
  }

  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return apiError(E_VALIDATION_FAILED, 400);
  }

  const { id } = parsedParams.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError(E_NOT_AUTHENTICATED, 401);
  }

  const { data: club, error: clubError } = await supabase
    .from("book_clubs" as never)
    .select(CLUB_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (clubError) {
    console.error("[book-clubs] detail lookup failed", {
      clubId: id,
      userId: user.id,
      message: (clubError as { message: string }).message,
      code: (clubError as { code: string }).code,
    });
    return apiError(E_CLUB_NOT_FOUND, 404);
  }

  if (!club) {
    return apiError(E_CLUB_NOT_FOUND, 404);
  }

  const clubRow = club as ClubRow;

  // Private clubs must only be readable by creator or members — do not leak
  // name / description / members to arbitrary authenticated users.
  if (!clubRow.is_public && clubRow.creator_id !== user.id) {
    const { data: membership } = await supabase
      .from("book_club_members" as never)
      .select("user_id")
      .eq("club_id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!membership) {
      return apiError(E_CLUB_NOT_FOUND, 404);
    }
  }

  const { data: members, error: membersError } = await supabase
    .from("book_club_members" as never)
    .select(MEMBER_SELECT)
    .eq("club_id", id)
    .order("joined_at", { ascending: true });

  if (membersError) {
    console.error("[book-clubs] members lookup failed", {
      clubId: id,
      userId: user.id,
      message: (membersError as { message: string }).message,
      code: (membersError as { code: string }).code,
    });
  }

  type RawMember = {
    user_id: string;
    role: string;
    joined_at: string;
    profiles: { display_name: string | null; avatar_url: string | null } | null;
  };

  const memberRows: MemberRow[] = ((members ?? []) as RawMember[]).map((m) => ({
    user_id: m.user_id,
    role: m.role,
    joined_at: m.joined_at,
    display_name: m.profiles?.display_name ?? null,
    avatar_url: m.profiles?.avatar_url ?? null,
  }));

  return NextResponse.json({ club: clubRow, members: memberRows });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isBookClubsEnabled()) {
    return apiError(E_CLUBS_FEATURE_DISABLED, 403);
  }

  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return apiError(E_VALIDATION_FAILED, 400);
  }

  const { id } = parsedParams.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError(E_NOT_AUTHENTICATED, 401);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(E_INVALID_JSON, 400);
  }

  const parsed = updateClubBodySchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(E_VALIDATION_FAILED, 400);
  }

  const { data: existingClub, error: lookupError } = await supabase
    .from("book_clubs" as never)
    .select(CLUB_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (lookupError) {
    console.error("[book-clubs] patch lookup failed", {
      clubId: id,
      userId: user.id,
      message: (lookupError as { message: string }).message,
      code: (lookupError as { code: string }).code,
    });
    return apiError(E_CLUB_UPDATE_FAILED, 500);
  }

  if (!existingClub) {
    return apiError(E_CLUB_NOT_FOUND, 404);
  }

  const existing = existingClub as ClubRow;
  if (existing.creator_id !== user.id) {
    return apiError(E_FORBIDDEN, 403);
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.is_public !== undefined) updates.is_public = parsed.data.is_public;
  if (parsed.data.max_members !== undefined) updates.max_members = parsed.data.max_members;
  if (parsed.data.current_book_id !== undefined) updates.current_book_id = parsed.data.current_book_id;

  const { data: updated, error: updateError } = await supabase
    .from("book_clubs" as never)
    .update(updates as never)
    .eq("id", id)
    .select(CLUB_SELECT)
    .single();

  if (updateError || !updated) {
    console.error("[book-clubs] update failed", {
      clubId: id,
      userId: user.id,
      message: (updateError as { message: string } | null)?.message,
      code: (updateError as { code: string } | null)?.code,
    });
    return apiError(E_CLUB_UPDATE_FAILED, 500);
  }

  return NextResponse.json({ club: updated as ClubRow });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isBookClubsEnabled()) {
    return apiError(E_CLUBS_FEATURE_DISABLED, 403);
  }

  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return apiError(E_VALIDATION_FAILED, 400);
  }

  const { id } = parsedParams.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError(E_NOT_AUTHENTICATED, 401);
  }

  const { data: existingClub, error: lookupError } = await supabase
    .from("book_clubs" as never)
    .select("id, creator_id")
    .eq("id", id)
    .maybeSingle();

  if (lookupError) {
    console.error("[book-clubs] delete lookup failed", {
      clubId: id,
      userId: user.id,
      message: (lookupError as { message: string }).message,
      code: (lookupError as { code: string }).code,
    });
    return apiError(E_CLUB_DELETE_FAILED, 500);
  }

  if (!existingClub) {
    return apiError(E_CLUB_NOT_FOUND, 404);
  }

  const existing = existingClub as { id: string; creator_id: string };
  if (existing.creator_id !== user.id) {
    return apiError(E_FORBIDDEN, 403);
  }

  const { error: deleteError } = await supabase
    .from("book_clubs" as never)
    .delete()
    .eq("id", id);

  if (deleteError) {
    console.error("[book-clubs] delete failed", {
      clubId: id,
      userId: user.id,
      message: (deleteError as { message: string }).message,
      code: (deleteError as { code: string }).code,
    });
    return apiError(E_CLUB_DELETE_FAILED, 500);
  }

  return NextResponse.json({ ok: true });
}
