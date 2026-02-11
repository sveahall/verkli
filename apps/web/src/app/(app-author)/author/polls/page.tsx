import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPollsEnabled } from "@/lib/flags";
import { requireAuthorRole } from "@/lib/auth/require-author";
import PollsPageClient from "./PollsPageClient";

export type PollRow = {
  id: string;
  question: string;
  is_active: boolean;
  closes_at: string | null;
  book_id: string | null;
  created_at: string;
};

export type PollOptionRow = {
  id: string;
  poll_id: string;
  text: string;
  sort_order: number;
};

export default async function AuthorPollsPage() {
  if (!getPollsEnabled()) {
    redirect("/author/home");
  }

  const authResult = await requireAuthorRole();
  if (!authResult.ok) {
    redirect("/reader/signin");
  }
  const user = authResult.user;

  const supabase = await createClient();

  // Fetch author's polls
  const { data: polls } = await supabase
    .from("polls" as never)
    .select("id, question, is_active, closes_at, book_id, created_at")
    .eq("author_id", user.id)
    .order("created_at", { ascending: false });

  const typedPolls = (polls as PollRow[] | null) ?? [];

  // Fetch options for all polls
  const pollIds = typedPolls.map((p) => p.id);
  let typedOptions: PollOptionRow[] = [];
  if (pollIds.length > 0) {
    const { data: options } = await supabase
      .from("poll_options" as never)
      .select("id, poll_id, text, sort_order")
      .in("poll_id", pollIds)
      .order("sort_order", { ascending: true });
    typedOptions = (options as PollOptionRow[] | null) ?? [];
  }

  // Fetch vote counts per poll
  const voteCounts: Record<string, number> = {};
  if (pollIds.length > 0) {
    const { data: votes } = await supabase
      .from("poll_votes" as never)
      .select("poll_id")
      .in("poll_id", pollIds);
    for (const v of (votes as { poll_id: string }[] | null) ?? []) {
      voteCounts[v.poll_id] = (voteCounts[v.poll_id] ?? 0) + 1;
    }
  }

  // Group options by poll
  const optionsByPoll: Record<string, PollOptionRow[]> = {};
  for (const opt of typedOptions) {
    if (!optionsByPoll[opt.poll_id]) optionsByPoll[opt.poll_id] = [];
    optionsByPoll[opt.poll_id].push(opt);
  }

  const pollsWithMeta = typedPolls.map((poll) => ({
    ...poll,
    options: optionsByPoll[poll.id] ?? [],
    voteCount: voteCounts[poll.id] ?? 0,
  }));

  return <PollsPageClient polls={pollsWithMeta} />;
}
