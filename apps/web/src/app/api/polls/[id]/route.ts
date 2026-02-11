import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isPollsEnabled } from "@/lib/flags";
import {
  apiError,
  E_NOT_AUTHENTICATED,
  E_POLLS_FEATURE_DISABLED,
  E_POLL_NOT_FOUND,
  E_POLL_CREATE_FAILED,
  E_INVALID_JSON,
  E_VALIDATION_FAILED,
  E_FORBIDDEN,
} from "@/lib/api-errors";

const paramsSchema = z.object({
  id: z.string().uuid("Invalid poll ID"),
});

type PollRow = {
  id: string;
  author_id: string;
  question: string;
  book_id: string | null;
  is_active: boolean;
  closes_at: string | null;
  created_at: string;
};

type PollOptionRow = {
  id: string;
  poll_id: string;
  text: string;
  sort_order: number;
  created_at: string;
};

type PollVoteRow = {
  option_id: string;
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  void request;

  if (!isPollsEnabled()) {
    return apiError(E_POLLS_FEATURE_DISABLED, 403);
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

  const { data: poll, error: pollError } = await supabase
    .from("polls" as never)
    .select("id, author_id, question, book_id, is_active, closes_at, created_at")
    .eq("id", id)
    .maybeSingle();

  if (pollError) {
    console.error("[polls] detail failed", {
      pollId: id,
      userId: user.id,
      message: pollError.message,
      code: pollError.code,
    });
    return apiError(E_POLL_NOT_FOUND, 404);
  }

  if (!poll) {
    return apiError(E_POLL_NOT_FOUND, 404);
  }

  const typedPoll = poll as PollRow;

  const { data: options, error: optionsError } = await supabase
    .from("poll_options" as never)
    .select("id, poll_id, text, sort_order, created_at")
    .eq("poll_id", id)
    .order("sort_order", { ascending: true });

  if (optionsError) {
    console.error("[polls] options load failed", {
      pollId: id,
      message: optionsError.message,
      code: optionsError.code,
    });
    return apiError(E_POLL_NOT_FOUND, 404);
  }

  const typedOptions = (options ?? []) as PollOptionRow[];

  const { data: vote, error: voteError } = await supabase
    .from("poll_votes" as never)
    .select("option_id")
    .eq("poll_id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (voteError) {
    console.error("[polls] vote lookup failed", {
      pollId: id,
      userId: user.id,
      message: voteError.message,
      code: voteError.code,
    });
  }

  const typedVote = vote as PollVoteRow | null;

  return NextResponse.json({
    poll: typedPoll,
    options: typedOptions,
    userVote: typedVote?.option_id ?? null,
  });
}

const patchBodySchema = z.object({
  is_active: z.boolean().optional(),
  closes_at: z.string().datetime().nullable().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isPollsEnabled()) {
    return apiError(E_POLLS_FEATURE_DISABLED, 403);
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(E_INVALID_JSON, 400);
  }

  const parsedBody = patchBodySchema.safeParse(body);
  if (!parsedBody.success) {
    return apiError(E_VALIDATION_FAILED, 400);
  }

  const { data: existing } = await supabase
    .from("polls" as never)
    .select("id, author_id")
    .eq("id", id)
    .maybeSingle();

  if (!existing) {
    return apiError(E_POLL_NOT_FOUND, 404);
  }

  if ((existing as PollRow).author_id !== user.id) {
    return apiError(E_FORBIDDEN, 403);
  }

  const updates: Record<string, unknown> = {};
  if (parsedBody.data.is_active !== undefined) {
    updates.is_active = parsedBody.data.is_active;
  }
  if (parsedBody.data.closes_at !== undefined) {
    updates.closes_at = parsedBody.data.closes_at;
  }

  const { data: updated, error: updateError } = await supabase
    .from("polls" as never)
    .update(updates as never)
    .eq("id", id)
    .select("id, author_id, question, book_id, is_active, closes_at, created_at")
    .single();

  if (updateError) {
    console.error("[polls] update failed", {
      pollId: id,
      userId: user.id,
      message: updateError.message,
      code: updateError.code,
    });
    return apiError(E_POLL_CREATE_FAILED, 500);
  }

  return NextResponse.json({ poll: updated as PollRow });
}
