"use client";

import { PageHeader } from "@/components/ui/page-header";
import PollCard from "@/components/polls/PollCard";
import EmptyState from "@/components/reader/EmptyState";

type PollOption = {
  id: string;
  poll_id: string;
  text: string;
  sort_order: number;
};

type PollWithMeta = {
  id: string;
  question: string;
  is_active: boolean;
  closes_at: string | null;
  created_at: string;
  options: PollOption[];
  userVoteOptionId: string | null;
};

type PollsPageClientProps = {
  polls: PollWithMeta[];
};

export default function PollsPageClient({ polls }: PollsPageClientProps) {
  return (
    <div className="section-gap">
      <PageHeader
        eyebrow="Community"
        title="Polls"
        description="Vote in active polls from authors you follow."
      />

      {polls.length === 0 ? (
        <EmptyState
          title="No active polls"
          description="There are no polls to show right now. Check back later!"
        />
      ) : (
        <div className="space-y-4">
          {polls.map((poll) => (
            <PollCard
              key={poll.id}
              pollId={poll.id}
              question={poll.question}
              options={poll.options}
              isActive={poll.is_active}
              closesAt={poll.closes_at}
              userVoteOptionId={poll.userVoteOptionId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
