import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPollsEnabled } from "@/lib/flags";
import PollsPageClient from "./PollsPageClient";

type PollRow = {
  id: string;
  question: string;
  is_active: boolean;
  closes_at: string | null;
  created_at: string;
};

type PollOptionRow = {
  id: string;
  poll_id: string;
  text: string;
  sort_order: number;
};

type PollVoteRow = {
  poll_id: string;
  option_id: string;
};

export default async function ReaderPollsPage() {
  if (!getPollsEnabled()) {
    redirect("/reader/library");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/reader/signin");
  }

  // Fetch active polls
  const { data: polls } = await supabase
    .from("polls" as never)
    .select("id, question, is_active, closes_at, created_at")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(50);

  const typedPolls = (polls ?? []) as PollRow[];

  if (typedPolls.length === 0) {
    return <PollsPageClient polls={[]} />;
  }

  // Fetch options for all polls
  const pollIds = typedPolls.map((p) => p.id);
  const { data: options } = await supabase
    .from("poll_options" as never)
    .select("id, poll_id, text, sort_order")
    .in("poll_id", pollIds)
    .order("sort_order", { ascending: true });

  const typedOptions = (options ?? []) as PollOptionRow[];

  // Fetch user's votes
  const { data: votes } = await supabase
    .from("poll_votes" as never)
    .select("poll_id, option_id")
    .eq("user_id", user.id)
    .in("poll_id", pollIds);

  const typedVotes = (votes ?? []) as PollVoteRow[];
  const voteMap = new Map(typedVotes.map((v) => [v.poll_id, v.option_id]));

  const pollsWithMeta = typedPolls.map((poll) => ({
    ...poll,
    options: typedOptions.filter((o) => o.poll_id === poll.id),
    userVoteOptionId: voteMap.get(poll.id) ?? null,
  }));

  return <PollsPageClient polls={pollsWithMeta} />;
}
