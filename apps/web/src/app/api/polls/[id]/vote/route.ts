import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isPollsEnabled } from "@/lib/flags";
import {
  apiError,
  E_NOT_AUTHENTICATED,
  E_POLLS_FEATURE_DISABLED,
  E_POLL_NOT_FOUND,
  E_POLL_CLOSED,
  E_POLL_ALREADY_VOTED,
  E_POLL_INVALID_OPTION,
  E_INVALID_JSON,
  E_VALIDATION_FAILED,
} from "@/lib/api-errors";

const paramsSchema = z.object({
  id: z.string().uuid("Invalid poll ID"),
});

const voteBodySchema = z.object({
  option_id: z.string().uuid(),
});

type PollRow = {
  id: string;
  is_active: boolean;
  closes_at: string | null;
};

type PollOptionRow = {
  id: string;
  poll_id: string;
};

export async function POST(
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

  const parsedBody = voteBodySchema.safeParse(body);
  if (!parsedBody.success) {
    return apiError(E_VALIDATION_FAILED, 400);
  }

  const { option_id } = parsedBody.data;

  const { data: poll, error: pollError } = await supabase
    .from("polls" as never)
    .select("id, is_active, closes_at")
    .eq("id", id)
    .maybeSingle();

  if (pollError || !poll) {
    return apiError(E_POLL_NOT_FOUND, 404);
  }

  const typedPoll = poll as PollRow;

  if (!typedPoll.is_active) {
    return apiError(E_POLL_CLOSED, 400);
  }

  if (typedPoll.closes_at && new Date(typedPoll.closes_at) < new Date()) {
    return apiError(E_POLL_CLOSED, 400);
  }

  const { data: option, error: optionError } = await supabase
    .from("poll_options" as never)
    .select("id, poll_id")
    .eq("id", option_id)
    .eq("poll_id", id)
    .maybeSingle();

  if (optionError || !option) {
    return apiError(E_POLL_INVALID_OPTION, 400);
  }

  void (option as PollOptionRow);

  const { error: insertError } = await supabase
    .from("poll_votes" as never)
    .insert({
      poll_id: id,
      option_id,
      user_id: user.id,
    } as never);

  if (insertError) {
    if (insertError.code === "23505") {
      return apiError(E_POLL_ALREADY_VOTED, 409);
    }

    console.error("[polls] vote insert failed", {
      pollId: id,
      optionId: option_id,
      userId: user.id,
      message: insertError.message,
      code: insertError.code,
    });
    return apiError(E_POLL_CLOSED, 400);
  }

  return NextResponse.json({ ok: true });
}
