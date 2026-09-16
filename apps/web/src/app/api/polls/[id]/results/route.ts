import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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
    .from("polls")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (pollError || !poll) {
    return apiError(E_POLL_NOT_FOUND, 404);
  }

  const { data: options, error: optionsError } = await supabase
    .from("poll_options")
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

  // Reader RLS exposes only their own vote. After checking poll visibility
  // above, use server-only counts; no voter identities leave the database.
  const admin = createAdminClient();
  const results: { option_id: string; text: string; count: number }[] = [];
  for (const option of typedOptions) {
    const { count, error: votesError } = await admin
      .from("poll_votes")
      .select("option_id", { count: "exact", head: true })
      .eq("poll_id", id)
      .eq("option_id", option.id);

    if (votesError) {
      console.error("[polls] results votes load failed", {
        pollId: id,
        message: votesError.message,
        code: votesError.code,
      });
      return apiError(E_POLL_RESULTS_LOAD_FAILED, 500);
    }

    results.push({ option_id: option.id, text: option.text, count: count ?? 0 });
  }
  const totalVotes = results.reduce((sum, option) => sum + option.count, 0);

  return NextResponse.json({ results, totalVotes });
}
