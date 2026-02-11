import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  apiError,
  E_NOT_AUTHENTICATED,
  E_CLUBS_FEATURE_DISABLED,
  E_CLUB_NOT_FOUND,
  E_CLUB_FULL,
  E_CLUB_ALREADY_MEMBER,
  E_CLUB_CREATE_FAILED,
  E_VALIDATION_FAILED,
} from "@/lib/api-errors";
import { isBookClubsEnabled } from "@/lib/flags";

const paramsSchema = z.object({
  id: z.string().uuid("Invalid club ID"),
});

type ClubRow = {
  id: string;
  is_public: boolean;
  max_members: number;
};

export async function POST(
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
    .select("id, is_public, max_members")
    .eq("id", id)
    .maybeSingle();

  if (clubError) {
    console.error("[book-clubs.join] club lookup failed", {
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

  const { count, error: countError } = await supabase
    .from("book_club_members" as never)
    .select("user_id", { count: "exact", head: true })
    .eq("club_id", id);

  if (countError) {
    console.error("[book-clubs.join] member count failed", {
      clubId: id,
      userId: user.id,
      message: (countError as { message: string }).message,
      code: (countError as { code: string }).code,
    });
    return apiError(E_CLUB_CREATE_FAILED, 500);
  }

  const memberCount = count ?? 0;
  if (memberCount >= clubRow.max_members) {
    return apiError(E_CLUB_FULL, 409);
  }

  const { error: insertError } = await supabase
    .from("book_club_members" as never)
    .insert({
      club_id: id,
      user_id: user.id,
      role: "member",
    } as never);

  if (insertError) {
    if ((insertError as { code: string }).code === "23505") {
      return apiError(E_CLUB_ALREADY_MEMBER, 409);
    }

    console.error("[book-clubs.join] insert failed", {
      clubId: id,
      userId: user.id,
      message: (insertError as { message: string }).message,
      code: (insertError as { code: string }).code,
    });
    return apiError(E_CLUB_CREATE_FAILED, 500);
  }

  return NextResponse.json({ ok: true });
}
