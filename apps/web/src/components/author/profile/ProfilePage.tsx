import ProfileHeader from "@/components/author/profile/ProfileHeader";
import ProfileStats from "@/components/author/profile/ProfileStats";
import ProfileShelfCard from "@/components/author/profile/ProfileShelfCard";
import ProfileBookCard from "@/components/author/profile/ProfileBookCard";
import type { ReactNode } from "react";

export type AuthorProfile = {
  displayName: string;
  username: string;
  bio: string;
  avatarUrl?: string | null;
  isPublic: boolean;
};

export type ProfileStatsData = {
  books: number;
  shelves: number;
  reads: number | null;
};

export type ProfileShelf = {
  id: string;
  name: string;
  subtitle?: string | null;
  cover_url?: string | null;
  cover_type?: string | null;
  cover_gradient?: string | null;
};

export type ProfileBook = {
  id: string;
  title: string;
  slug?: string | null;
  cover_image?: string | null;
  status?: string | null;
};

type EmptyStateCardProps = {
  children: ReactNode;
};

function EmptyStateCard({ children }: EmptyStateCardProps) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-6 text-center text-[14px] text-slate-600 sm:rounded-[24px] sm:p-10 dark:border-white/[0.15] dark:bg-white/[0.03] dark:text-white/60">
      {children}
    </div>
  );
}

export default function ProfilePage({
  profile,
  stats,
  shelves,
  standaloneBooks,
}: {
  profile: AuthorProfile;
  stats: ProfileStatsData;
  shelves: ProfileShelf[];
  standaloneBooks: ProfileBook[];
}) {
  return (
    <main className="min-h-screen bg-transparent text-foreground mt-25">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-8 px-4 pb-20 pt-6 sm:gap-10 sm:px-6 sm:pt-10">
        <ProfileHeader
          displayName={profile.displayName}
          username={profile.username}
          bio={profile.bio}
          avatarUrl={profile.avatarUrl}
          isPublic={profile.isPublic}
        />

        <ProfileStats books={stats.books} shelves={stats.shelves} reads={stats.reads} />

        <section className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[22px] font-semibold text-slate-900 dark:text-white">Public shelves</h2>
              <p className="text-[14px] text-slate-600 dark:text-white/50">
                Curated collections your readers can explore.
              </p>
            </div>
            <span className="text-[12px] font-semibold uppercase tracking-[0.25em] text-slate-400 dark:text-white/40">
              {shelves.length} total
            </span>
          </div>

          {shelves.length === 0 ? (
            <EmptyStateCard>
              No shelves yet. Create one to showcase your collections.
            </EmptyStateCard>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {shelves.map((shelf) => (
                <ProfileShelfCard
                  key={shelf.id}
                  id={shelf.id}
                  name={shelf.name}
                  subtitle={shelf.subtitle}
                  coverUrl={shelf.cover_url}
                  coverType={shelf.cover_type}
                  coverGradient={shelf.cover_gradient}
                />
              ))}
            </div>
          )}
        </section>

        <section className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[22px] font-semibold text-slate-900 dark:text-white">Standalone books</h2>
              <p className="text-[14px] text-slate-600 dark:text-white/50">
                Published titles not yet placed on a shelf.
              </p>
            </div>
            <span className="text-[12px] font-semibold uppercase tracking-[0.25em] text-slate-400 dark:text-white/40">
              {standaloneBooks.length} total
            </span>
          </div>

          {standaloneBooks.length === 0 ? (
            <EmptyStateCard>No standalone books to show right now.</EmptyStateCard>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {standaloneBooks.map((book) => (
                <ProfileBookCard
                  key={book.id}
                  id={book.id}
                  title={book.title}
                  slug={book.slug}
                  coverImage={book.cover_image}
                  status={book.status}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
