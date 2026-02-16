"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import BookClubCard, { type BookClubCardData } from "@/components/clubs/BookClubCard";
import CreateClubDialog from "@/components/clubs/CreateClubDialog";
import EmptyState from "@/components/reader/EmptyState";
import { resolveErrorMessage } from "@/lib/error-messages";

type ClubsPageClientProps = {
  clubs: BookClubCardData[];
};

export default function ClubsPageClient({ clubs }: ClubsPageClientProps) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [activeTab, setActiveTab] = useState("mine");
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const myClubs = useMemo(
    () => clubs.filter((c) => c.isMember),
    [clubs]
  );
  const exploreClubs = useMemo(
    () => clubs.filter((c) => !c.isMember),
    [clubs]
  );
  const activeClubs = activeTab === "mine" ? myClubs : exploreClubs;

  const tabs: TabItem[] = useMemo(
    () => [
      { id: "mine", label: "My clubs", badge: `${myClubs.length}` },
      { id: "explore", label: "Explore", badge: `${exploreClubs.length}` },
    ],
    [myClubs.length, exploreClubs.length]
  );

  const handleJoin = useCallback(
    async (clubId: string) => {
      setJoiningId(clubId);
      setError(null);
      try {
        const res = await fetch(`/api/book-clubs/${clubId}/join`, {
          method: "POST",
          credentials: "include",
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
        setJoiningId(null);
      }
    },
    [router]
  );

  return (
    <div className="section-gap">
      <PageHeader
        eyebrow="Book clubs"
        title="Book clubs"
        description="Read together with others. Join a club or create your own."
        actions={
          <Button onClick={() => setShowCreate(true)}>Create club</Button>
        }
      />

      {error && (
        <p className="text-[13px] text-red-600 dark:text-red-400">{error}</p>
      )}

      <Tabs items={tabs} active={activeTab} onChange={setActiveTab} />

      {activeClubs.length === 0 ? (
        <EmptyState
          title={
            activeTab === "mine"
              ? "You are not in any clubs yet"
              : "No clubs to explore"
          }
          description={
            activeTab === "mine"
              ? "Create your own book club or explore existing ones."
              : "Be the first to create a book club!"
          }
          action={
            activeTab === "mine" ? (
              <Button variant="secondary" onClick={() => setActiveTab("explore")}>
                Explore clubs
              </Button>
            ) : (
              <Button onClick={() => setShowCreate(true)}>Create club</Button>
            )
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {activeClubs.map((club) => (
            <BookClubCard
              key={club.id}
              club={club}
              onJoin={handleJoin}
              joining={joiningId === club.id}
            />
          ))}
        </div>
      )}

      <CreateClubDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onCreated={() => router.refresh()}
      />
    </div>
  );
}
