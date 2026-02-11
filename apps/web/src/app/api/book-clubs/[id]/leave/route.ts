import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  apiError,
  E_NOT_AUTHENTICATED,
  E_CLUBS_FEATURE_DISABLED,
  E_CLUB_NOT_MEMBER,
  E_CLUB_OWNER_CANNOT_LEAVE,
  E_CLUB_DELETE_FAILED,
  E_VALIDATION_FAILED,
} from "@/lib/api-errors";
import { isBookClubsEnabled } from "@/lib/flags";

const paramsSchema = z.object({
  id: z.string().uuid("Invalid club ID"),
});

type MemberRow = {
  club_id: string;
  user_id: string;
  role: string;
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

  const { data: member, error: memberError } = await supabase
    .from("book_club_members" as never)
    .select("club_id, user_id, role")
    .eq("club_id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (memberError) {
    console.error("[book-clubs.leave] membership lookup failed", {
      clubId: id,
      userId: user.id,
      message: (memberError as { message: string }).message,
      code: (memberError as { code: string }).code,
    });
    return apiError(E_CLUB_NOT_MEMBER, 400);
  }

  if (!member) {
    return apiError(E_CLUB_NOT_MEMBER, 400);
  }

  const memberRow = member as MemberRow;
  if (memberRow.role === "owner") {
    return apiError(E_CLUB_OWNER_CANNOT_LEAVE, 400);
  }

  const { error: deleteError } = await supabase
    .from("book_club_members" as never)
    .delete()
    .eq("club_id", id)
    .eq("user_id", user.id);

  if (deleteError) {
    console.error("[book-clubs.leave] delete failed", {
      clubId: id,
      userId: user.id,
      message: (deleteError as { message: string }).message,
      code: (deleteError as { code: string }).code,
    });
    return apiError(E_CLUB_DELETE_FAILED, 500);
  }

  return NextResponse.json({ ok: true });
}
