"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { resolveErrorMessage } from "@/lib/error-messages";

type PollOption = {
  id: string;
  text: string;
  sort_order: number;
};

type ResultOption = {
  option_id: string;
  text: string;
  count: number;
};

type PollCardProps = {
  pollId: string;
  question: string;
  options: PollOption[];
  isActive: boolean;
  closesAt: string | null;
  /** ID of the option the user already voted for, or null */
  userVoteOptionId: string | null;
};

export default function PollCard({
  pollId,
  question,
  options,
  isActive,
  closesAt,
  userVoteOptionId,
}: PollCardProps) {
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [hasVoted, setHasVoted] = useState(!!userVoteOptionId);
  const [votedOptionId, setVotedOptionId] = useState<string | null>(userVoteOptionId);
  const [voting, setVoting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ResultOption[] | null>(null);
  const [totalVotes, setTotalVotes] = useState(0);

  const isClosed =
    !isActive || (closesAt && new Date(closesAt) < new Date());

  // Load results when user has voted or poll is closed
  const loadResults = useCallback(async () => {
    try {
      const res = await fetch(`/api/polls/${pollId}/results`, {
        credentials: "include",
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        results: ResultOption[];
        totalVotes: number;
      };
      setResults(data.results);
      setTotalVotes(data.totalVotes);
    } catch {
      // Silently fail — results are non-critical
    }
  }, [pollId]);

  useEffect(() => {
    if (hasVoted || isClosed) {
      void loadResults();
    }
  }, [hasVoted, isClosed, loadResults]);

  const handleVote = useCallback(async () => {
    if (!selectedOptionId || isClosed) return;
    setVoting(true);
    setError(null);

    try {
      const res = await fetch(`/api/polls/${pollId}/vote`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ option_id: selectedOptionId }),
      });

      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(resolveErrorMessage(body.error));
        return;
      }

      setHasVoted(true);
      setVotedOptionId(selectedOptionId);
    } catch {
      setError(resolveErrorMessage(null));
    } finally {
      setVoting(false);
    }
  }, [pollId, selectedOptionId, isClosed]);

  const showResults = hasVoted || !!isClosed;

  return (
    <Card className="p-5">
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white">
            {question}
          </h3>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
              isClosed
                ? "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-white/50"
                : "bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400"
            }`}
          >
            {isClosed ? "Closed" : "Active"}
          </span>
        </div>

        {error && (
          <p className="text-[13px] text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        {showResults && results ? (
          <div className="space-y-2">
            {results.map((r) => {
              const pct = totalVotes > 0 ? Math.round((r.count / totalVotes) * 100) : 0;
              const isMyVote = r.option_id === votedOptionId;
              return (
                <div key={r.option_id} className="space-y-1">
                  <div className="flex items-center justify-between text-[13px]">
                    <span
                      className={
                        isMyVote
                          ? "font-medium text-slate-900 dark:text-white"
                          : "text-slate-600 dark:text-white/60"
                      }
                    >
                      {r.text}
                      {isMyVote && (
                        <span className="ml-1.5 text-[11px] text-[#907AFF]">
                          (your vote)
                        </span>
                      )}
                    </span>
                    <span className="tabular-nums text-slate-500 dark:text-white/40">
                      {pct}%
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                    <div
                      className={`h-full rounded-full transition-all ${
                        isMyVote
                          ? "bg-[#907AFF]"
                          : "bg-slate-300 dark:bg-white/20"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
            <p className="text-[12px] text-slate-400 dark:text-white/30">
              {totalVotes} {totalVotes === 1 ? "vote" : "votes"} total
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {options.map((opt) => (
              <label
                key={opt.id}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-[14px] transition ${
                  selectedOptionId === opt.id
                    ? "border-[#907AFF] bg-[#907AFF]/5 text-slate-900 dark:text-white"
                    : "border-slate-200/80 bg-white text-slate-600 hover:border-slate-300 dark:border-white/10 dark:bg-white/5 dark:text-white/60 dark:hover:border-white/20"
                }`}
              >
                <input
                  type="radio"
                  name={`poll-${pollId}`}
                  value={opt.id}
                  checked={selectedOptionId === opt.id}
                  onChange={() => setSelectedOptionId(opt.id)}
                  className="sr-only"
                />
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                    selectedOptionId === opt.id
                      ? "border-[#907AFF] bg-[#907AFF]"
                      : "border-slate-300 dark:border-white/20"
                  }`}
                >
                  {selectedOptionId === opt.id && (
                    <span className="h-1.5 w-1.5 rounded-full bg-white" />
                  )}
                </span>
                {opt.text}
              </label>
            ))}

            <Button
              onClick={handleVote}
              disabled={!selectedOptionId || !!isClosed}
              isLoading={voting}
              loadingText="Voting..."
              className="mt-1"
              size="sm"
            >
              Vote
            </Button>
          </div>
        )}

        {closesAt && !isClosed && (
          <p className="text-[12px] text-slate-400 dark:text-white/30">
            Closes{" "}
            {new Date(closesAt).toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        )}
      </div>
    </Card>
  );
}
