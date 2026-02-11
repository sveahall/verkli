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
      { id: "mine", label: "Mina klubbar", badge: `${myClubs.length}` },
      { id: "explore", label: "Utforska", badge: `${exploreClubs.length}` },
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
        eyebrow="Bokklubbar"
        title="Bokklubbar"
        description="Läs tillsammans med andra. Gå med i en klubb eller skapa din egen."
        actions={
          <Button onClick={() => setShowCreate(true)}>Skapa klubb</Button>
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
              ? "Du är inte med i någon klubb ännu"
              : "Inga klubbar att utforska"
          }
          description={
            activeTab === "mine"
              ? "Skapa en egen bokklubb eller utforska befintliga."
              : "Bli den första att skapa en bokklubb!"
          }
          action={
            activeTab === "mine" ? (
              <Button variant="secondary" onClick={() => setActiveTab("explore")}>
                Utforska klubbar
              </Button>
            ) : (
              <Button onClick={() => setShowCreate(true)}>Skapa klubb</Button>
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
