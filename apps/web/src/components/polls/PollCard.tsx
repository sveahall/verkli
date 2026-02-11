"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { resolveErrorMessage } from "@/lib/error-messages";

type PollOption = {
  id: string;
  text: string;
  sort_order: number;
};

type PollResult = {
  option_id: string;
  text: string;
  count: number;
};

export type PollCardData = {
  id: string;
  question: string;
  options: PollOption[];
  userVoteOptionId: string | null;
  results?: PollResult[];
  totalVotes?: number;
  closes_at: string | null;
  is_active: boolean;
};

type PollCardProps = {
  poll: PollCardData;
  onVoted?: () => void;
};

export default function PollCard({ poll, onVoted }: PollCardProps) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [voting, setVoting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voted, setVoted] = useState(poll.userVoteOptionId);
  const [results, setResults] = useState<PollResult[] | null>(
    poll.results ?? null
  );
  const [totalVotes, setTotalVotes] = useState(poll.totalVotes ?? 0);

  const hasVoted = voted !== null;

  const handleVote = useCallback(async () => {
    if (!selectedOption) return;
    setVoting(true);
    setError(null);

    try {
      const res = await fetch(`/api/polls/${poll.id}/vote`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ option_id: selectedOption }),
      });

      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(resolveErrorMessage(body.error));
        return;
      }

      setVoted(selectedOption);

      // Fetch results
      const resResults = await fetch(`/api/polls/${poll.id}/results`, {
        credentials: "include",
      });
      if (resResults.ok) {
        const resultsBody = (await resResults.json()) as {
          results: PollResult[];
          totalVotes: number;
        };
        setResults(resultsBody.results);
        setTotalVotes(resultsBody.totalVotes);
      }

      onVoted?.();
    } catch {
      setError(resolveErrorMessage(null));
    } finally {
      setVoting(false);
    }
  }, [poll.id, selectedOption, onVoted]);

  const isClosed =
    !poll.is_active ||
    (poll.closes_at && new Date(poll.closes_at) < new Date());

  return (
    <Card className="p-5">
      <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white">
        {poll.question}
      </h3>

      {isClosed && (
        <p className="mt-1 text-[12px] font-medium text-amber-600 dark:text-amber-400">
          Omröstningen är stängd
        </p>
      )}

      <div className="mt-4 space-y-2">
        {hasVoted || isClosed ? (
          // Results view
          (results ?? poll.options.map((o) => ({ option_id: o.id, text: o.text, count: 0 }))).map(
            (r) => {
              const pct = totalVotes > 0 ? (r.count / totalVotes) * 100 : 0;
              const isUserVote = r.option_id === voted;
              return (
                <div key={r.option_id} className="space-y-1">
                  <div className="flex items-center justify-between text-[13px]">
                    <span
                      className={`${
                        isUserVote
                          ? "font-semibold text-slate-900 dark:text-white"
                          : "text-slate-600 dark:text-white/70"
                      }`}
                    >
                      {r.text}
                      {isUserVote && " (ditt val)"}
                    </span>
                    <span className="text-slate-500 dark:text-white/50">
                      {r.count} ({Math.round(pct)}%)
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isUserVote
                          ? "bg-slate-900 dark:bg-white"
                          : "bg-slate-300 dark:bg-white/30"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            }
          )
        ) : (
          // Voting view
          <>
            {poll.options.map((opt) => (
              <label
                key={opt.id}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-[14px] transition ${
                  selectedOption === opt.id
                    ? "border-slate-900 bg-slate-50 text-slate-900 dark:border-white dark:bg-white/10 dark:text-white"
                    : "border-slate-200/80 text-slate-600 hover:border-slate-300 dark:border-white/10 dark:text-white/70 dark:hover:border-white/20"
                }`}
              >
                <input
                  type="radio"
                  name={`poll-${poll.id}`}
                  value={opt.id}
                  checked={selectedOption === opt.id}
                  onChange={() => setSelectedOption(opt.id)}
                  className="h-4 w-4 border-slate-300 text-slate-900 focus:ring-[#907AFF]/40 dark:border-white/20 dark:bg-white/10"
                />
                {opt.text}
              </label>
            ))}
            <Button
              size="sm"
              onClick={handleVote}
              disabled={!selectedOption}
              isLoading={voting}
              loadingText="Röstar..."
              className="mt-2"
            >
              Rösta
            </Button>
          </>
        )}
      </div>

      {error && (
        <p className="mt-2 text-[12px] text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {totalVotes > 0 && hasVoted && (
        <p className="mt-3 text-[12px] text-slate-400 dark:text-white/40">
          Totalt {totalVotes} {totalVotes === 1 ? "röst" : "röster"}
        </p>
      )}
    </Card>
  );
}
