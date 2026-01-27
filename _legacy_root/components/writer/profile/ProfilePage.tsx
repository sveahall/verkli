import ProfileHeader from "@/components/writer/profile/ProfileHeader";
import ProfileStats from "@/components/writer/profile/ProfileStats";
import ProfileShelfCard from "@/components/writer/profile/ProfileShelfCard";
import ProfileBookCard from "@/components/writer/profile/ProfileBookCard";

export type WriterProfile = {
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
  cover_url?: string | null;
  status?: string | null;
};

export default function ProfilePage({
  profile,
  stats,
  shelves,
  standaloneBooks,
}: {
  profile: WriterProfile;
  stats: ProfileStatsData;
  shelves: ProfileShelf[];
  standaloneBooks: ProfileBook[];
}) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-10 px-6 pb-20 pt-10">
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
            <div className="rounded-[24px] border border-dashed border-black/20 bg-black/5 p-10 text-center text-[14px] text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/60">
              No shelves yet. Create one to showcase your collections.
            </div>
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
            <div className="rounded-[24px] border border-dashed border-black/20 bg-black/5 p-10 text-center text-[14px] text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/60">
              No standalone books to show right now.
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {standaloneBooks.map((book) => (
                <ProfileBookCard
                  key={book.id}
                  id={book.id}
                  title={book.title}
                  slug={book.slug}
                  coverUrl={book.cover_url}
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
