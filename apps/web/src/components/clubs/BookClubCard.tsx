"use client";

import Link from "next/link";
import Image from "next/image";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export type BookClubCardData = {
  id: string;
  name: string;
  description: string | null;
  cover_url: string | null;
  memberCount: number;
  currentBook?: { id: string; title: string } | null;
  isMember: boolean;
};

type BookClubCardProps = {
  club: BookClubCardData;
  onJoin?: (clubId: string) => void;
  joining?: boolean;
};

export default function BookClubCard({ club, onJoin, joining }: BookClubCardProps) {
  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-gradient-to-br from-slate-200/70 via-white to-slate-100 dark:from-white/10 dark:via-white/5 dark:to-slate-900/60">
        {club.cover_url ? (
          <Image
            src={club.cover_url}
            alt={club.name}
            fill
            sizes="(min-width: 1024px) 33vw, 100vw"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <svg className="h-10 w-10 text-slate-400 dark:text-white/30" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
            </svg>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex-1">
          <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white truncate">
            {club.name}
          </h3>
          {club.description && (
            <p className="mt-1 text-[13px] text-slate-500 dark:text-white/60 line-clamp-2">
              {club.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 text-[12px] text-slate-500 dark:text-white/50">
          <span>{club.memberCount} {club.memberCount === 1 ? "member" : "members"}</span>
          {club.currentBook && (
            <>
              <span className="h-1 w-1 rounded-full bg-slate-300 dark:bg-white/30" />
              <span className="truncate">Reading: {club.currentBook.title}</span>
            </>
          )}
        </div>
        {club.isMember ? (
          <Link href={`/reader/clubs/${club.id}`}>
            <Button variant="secondary" size="sm" fullWidth>
              View club
            </Button>
          </Link>
        ) : (
          <Button
            variant="primary"
            size="sm"
            fullWidth
            onClick={() => onJoin?.(club.id)}
            isLoading={joining}
            loadingText="Joining..."
          >
            Join
          </Button>
        )}
      </div>
    </Card>
  );
}
