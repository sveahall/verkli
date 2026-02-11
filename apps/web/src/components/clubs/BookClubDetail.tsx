"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import ClubChat from "./ClubChat";
import { resolveErrorMessage } from "@/lib/error-messages";

type Member = {
  user_id: string;
  role: string;
  joined_at: string;
};

type ClubData = {
  id: string;
  name: string;
  description: string | null;
  cover_url: string | null;
  is_public: boolean;
  max_members: number;
  current_book_id: string | null;
  creator_id: string;
  created_at: string;
};

type ChatMessage = {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
};

type BookClubDetailProps = {
  club: ClubData;
  members: Member[];
  currentUser: { id: string };
  initialMessages: ChatMessage[];
};

export default function BookClubDetail({
  club,
  members,
  currentUser,
  initialMessages,
}: BookClubDetailProps) {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOwner = club.creator_id === currentUser.id;
  const isMember = members.some((m) => m.user_id === currentUser.id);

  const handleLeave = useCallback(async () => {
    setLeaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/book-clubs/${club.id}/leave`, {
        method: "POST",
        credentials: "include",
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(resolveErrorMessage(body.error));
        return;
      }
      router.push("/reader/clubs");
      router.refresh();
    } catch {
      setError(resolveErrorMessage(null));
    } finally {
      setLeaving(false);
    }
  }, [club.id, router]);

  const handleDelete = useCallback(async () => {
    if (!confirm("Är du säker på att du vill radera denna bokklubb?")) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/book-clubs/${club.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(resolveErrorMessage(body.error));
        return;
      }
      router.push("/reader/clubs");
      router.refresh();
    } catch {
      setError(resolveErrorMessage(null));
    } finally {
      setDeleting(false);
    }
  }, [club.id, router]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <h1 className="text-page-title">{club.name}</h1>
          {club.description && (
            <p className="max-w-2xl text-body">{club.description}</p>
          )}
          <div className="flex items-center gap-3 text-[13px] text-slate-500 dark:text-white/50">
            <span>{members.length} {members.length === 1 ? "medlem" : "medlemmar"}</span>
            <span className="h-1 w-1 rounded-full bg-slate-300 dark:bg-white/30" />
            <span>{club.is_public ? "Offentlig" : "Privat"}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isMember && !isOwner && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleLeave}
              isLoading={leaving}
              loadingText="Lämnar..."
            >
              Lämna klubb
            </Button>
          )}
          {isOwner && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              isLoading={deleting}
              loadingText="Raderar..."
            >
              Radera klubb
            </Button>
          )}
        </div>
      </div>

      {error && (
        <p className="text-[13px] text-red-600 dark:text-red-400">{error}</p>
      )}

      <div>
        <h2 className="mb-3 text-[15px] font-semibold text-slate-900 dark:text-white">
          Medlemmar
        </h2>
        <div className="flex flex-wrap gap-2">
          {members.map((m) => (
            <span
              key={m.user_id}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-white px-3 py-1.5 text-[12px] text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-white/60"
            >
              {m.user_id.slice(0, 8)}
              {m.role === "owner" && (
                <span className="rounded-full bg-slate-900 px-1.5 py-0.5 text-[10px] font-medium text-white dark:bg-white dark:text-slate-900">
                  Ägare
                </span>
              )}
            </span>
          ))}
        </div>
      </div>

      {isMember && (
        <div>
          <h2 className="mb-3 text-[15px] font-semibold text-slate-900 dark:text-white">
            Chatt
          </h2>
          <ClubChat
            clubId={club.id}
            initialMessages={initialMessages}
            currentUserId={currentUser.id}
          />
        </div>
      )}
    </div>
  );
}
