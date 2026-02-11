"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import PollCreator from "@/components/polls/PollCreator";
import EmptyState from "@/components/reader/EmptyState";
import { resolveErrorMessage } from "@/lib/error-messages";

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
  book_id: string | null;
  created_at: string;
  options: PollOption[];
  voteCount: number;
};

type PollsPageClientProps = {
  polls: PollWithMeta[];
};

export default function PollsPageClient({ polls }: PollsPageClientProps) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleToggleActive = useCallback(
    async (pollId: string, currentlyActive: boolean) => {
      setTogglingId(pollId);
      setError(null);
      try {
        const res = await fetch(`/api/polls/${pollId}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_active: !currentlyActive }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        if (!res.ok) {
          setError(resolveErrorMessage(body.error));
          return;
        }
        router.refresh();
      } catch {
        setError(resolveErrorMessage(null));
      } finally {
        setTogglingId(null);
      }
    },
    [router]
  );

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleDateString("sv-SE", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="section-gap">
      <PageHeader
        eyebrow="Omröstningar"
        title="Dina omröstningar"
        description="Skapa omröstningar för att engagera dina läsare."
        actions={
          <Button onClick={() => setShowCreate(true)}>
            Skapa omröstning
          </Button>
        }
      />

      {error && (
        <p className="text-[13px] text-red-600 dark:text-red-400">{error}</p>
      )}

      {polls.length === 0 ? (
        <EmptyState
          title="Inga omröstningar ännu"
          description="Skapa din första omröstning för att engagera dina läsare."
          action={
            <Button onClick={() => setShowCreate(true)}>
              Skapa omröstning
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {polls.map((poll) => {
            const isClosed =
              !poll.is_active ||
              (poll.closes_at && new Date(poll.closes_at) < new Date());
            return (
              <Card key={poll.id} className="p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex-1 space-y-1">
                    <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white">
                      {poll.question}
                    </h3>
                    <div className="flex flex-wrap items-center gap-2 text-[12px] text-slate-500 dark:text-white/50">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          isClosed
                            ? "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-white/50"
                            : "bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400"
                        }`}
                      >
                        {isClosed ? "Stängd" : "Aktiv"}
                      </span>
                      <span>{poll.voteCount} {poll.voteCount === 1 ? "röst" : "röster"}</span>
                      <span>{poll.options.length} alternativ</span>
                      <span>Skapad {formatDate(poll.created_at)}</span>
                      {poll.closes_at && (
                        <span>Stängs {formatDate(poll.closes_at)}</span>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {poll.options.map((opt) => (
                        <span
                          key={opt.id}
                          className="rounded-full border border-slate-200/80 px-2.5 py-1 text-[11px] text-slate-500 dark:border-white/10 dark:text-white/50"
                        >
                          {opt.text}
                        </span>
                      ))}
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleToggleActive(poll.id, poll.is_active)}
                    isLoading={togglingId === poll.id}
                    loadingText="..."
                  >
                    {poll.is_active ? "Stäng" : "Öppna"}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <PollCreator
        open={showCreate}
        onOpenChange={setShowCreate}
        onCreated={() => router.refresh()}
      />
    </div>
  );
}
