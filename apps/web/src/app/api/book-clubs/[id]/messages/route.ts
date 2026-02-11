import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  apiError,
  E_NOT_AUTHENTICATED,
  E_CLUBS_FEATURE_DISABLED,
  E_CLUB_NOT_MEMBER,
  E_CLUB_MESSAGE_FAILED,
  E_CLUB_MESSAGES_LOAD_FAILED,
  E_INVALID_JSON,
  E_VALIDATION_FAILED,
} from "@/lib/api-errors";
import { isBookClubsEnabled } from "@/lib/flags";

const paramsSchema = z.object({
  id: z.string().uuid("Invalid club ID"),
});

const createMessageBodySchema = z.object({
  content: z.string().min(1).max(2000),
});

type MessageRow = {
  id: string;
  club_id: string;
  user_id: string;
  content: string;
  created_at: string;
};

const MESSAGE_SELECT = "id, club_id, user_id, content, created_at";

async function checkMembership(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clubId: string,
  userId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("book_club_members" as never)
    .select("user_id")
    .eq("club_id", clubId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[book-clubs.messages] membership check failed", {
      clubId,
      userId,
      message: (error as { message: string }).message,
      code: (error as { code: string }).code,
    });
    return false;
  }

  return !!data;
}

export async function GET(
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

  const isMember = await checkMembership(supabase, id, user.id);
  if (!isMember) {
    return apiError(E_CLUB_NOT_MEMBER, 403);
  }

  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "50", 10)));
  const offset = (page - 1) * limit;

  const { data, error } = await supabase
    .from("book_club_messages" as never)
    .select(MESSAGE_SELECT)
    .eq("club_id", id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("[book-clubs.messages] list failed", {
      clubId: id,
      userId: user.id,
      message: (error as { message: string }).message,
      code: (error as { code: string }).code,
    });
    return apiError(E_CLUB_MESSAGES_LOAD_FAILED, 500);
  }

  const messages = (data ?? []) as MessageRow[];

  return NextResponse.json({ messages });
}

export async function POST(
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

  const isMember = await checkMembership(supabase, id, user.id);
  if (!isMember) {
    return apiError(E_CLUB_NOT_MEMBER, 403);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(E_INVALID_JSON, 400);
  }

  const parsed = createMessageBodySchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(E_VALIDATION_FAILED, 400);
  }

  const { content } = parsed.data;

  const { data: message, error: insertError } = await supabase
    .from("book_club_messages" as never)
    .insert({
      club_id: id,
      user_id: user.id,
      content,
    } as never)
    .select(MESSAGE_SELECT)
    .single();

  if (insertError || !message) {
    console.error("[book-clubs.messages] send failed", {
      clubId: id,
      userId: user.id,
      message: (insertError as { message: string } | null)?.message,
      code: (insertError as { code: string } | null)?.code,
    });
    return apiError(E_CLUB_MESSAGE_FAILED, 500);
  }

  return NextResponse.json({ message: message as MessageRow }, { status: 201 });
}
