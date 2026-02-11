import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isPollsEnabled } from "@/lib/flags";
import {
  apiError,
  E_NOT_AUTHENTICATED,
  E_POLLS_FEATURE_DISABLED,
  E_POLL_NOT_FOUND,
  E_POLL_RESULTS_LOAD_FAILED,
  E_VALIDATION_FAILED,
} from "@/lib/api-errors";

const paramsSchema = z.object({
  id: z.string().uuid("Invalid poll ID"),
});

type PollOptionRow = {
  id: string;
  poll_id: string;
  text: string;
  sort_order: number;
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
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (pollError || !poll) {
    return apiError(E_POLL_NOT_FOUND, 404);
  }

  const { data: options, error: optionsError } = await supabase
    .from("poll_options" as never)
    .select("id, poll_id, text, sort_order")
    .eq("poll_id", id)
    .order("sort_order", { ascending: true });

  if (optionsError) {
    console.error("[polls] results options load failed", {
      pollId: id,
      message: optionsError.message,
      code: optionsError.code,
    });
    return apiError(E_POLL_RESULTS_LOAD_FAILED, 500);
  }

  const typedOptions = (options ?? []) as PollOptionRow[];

  const { data: votes, error: votesError } = await supabase
    .from("poll_votes" as never)
    .select("option_id")
    .eq("poll_id", id);

  if (votesError) {
    console.error("[polls] results votes load failed", {
      pollId: id,
      message: votesError.message,
      code: votesError.code,
    });
    return apiError(E_POLL_RESULTS_LOAD_FAILED, 500);
  }

  const typedVotes = (votes ?? []) as PollVoteRow[];

  const countsByOptionId = new Map<string, number>();
  for (const vote of typedVotes) {
    countsByOptionId.set(
      vote.option_id,
      (countsByOptionId.get(vote.option_id) ?? 0) + 1
    );
  }

  const results = typedOptions.map((option) => ({
    option_id: option.id,
    text: option.text,
    count: countsByOptionId.get(option.id) ?? 0,
  }));

  const totalVotes = typedVotes.length;

  return NextResponse.json({ results, totalVotes });
}
