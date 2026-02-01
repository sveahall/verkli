import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAvatarUrlFromPathServer } from "@/lib/supabase/avatar";
import BookCard from "@/components/reader/BookCard";

export default async function ReaderWriterProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: userId } = await params;

  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("user_id, display_name, username, bio, avatar_url, is_public")
    .eq("user_id", userId)
    .maybeSingle();

  if (!profile || !profile.is_public) {
    notFound();
  }

  const avatarUrl = await getAvatarUrlFromPathServer(profile.avatar_url);
  const displayName = profile.display_name || profile.username || "Writer";

  const { data: books } = await supabase
    .from("books")
    .select("id, title, cover_image, description")
    .eq("author_id", userId)
    .eq("status", "PUBLISHED")
    .order("updated_at", { ascending: false });

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#050508] dark:text-white">
      <header className="mx-auto max-w-[1100px] px-6 pt-10">
        <Link href="/reader/discover" className="text-[13px] text-slate-600 hover:text-slate-900 dark:text-white/50 dark:hover:text-white/70">
          ← Back to discover
        </Link>
      </header>

      <section className="mx-auto max-w-[1100px] px-6 py-12">
        <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
          <div className="h-24 w-24 flex-shrink-0 overflow-hidden rounded-full border-2 border-black/10 bg-slate-100 dark:border-white/10 dark:bg-white/5">
            {avatarUrl ? (
              <img src={avatarUrl} alt={displayName} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-2xl font-semibold text-slate-600 dark:text-white/60">
                {displayName.split(" ").map((w: string) => w[0]).slice(0, 2).join("")}
              </div>
            )}
          </div>
          <div>
            <h1 className="text-[32px] font-semibold tracking-tight text-slate-900 dark:text-white">
              {displayName}
            </h1>
            {profile.bio && (
              <p className="mt-2 max-w-[560px] text-[15px] leading-relaxed text-slate-600 dark:text-white/60">
                {profile.bio}
              </p>
            )}
          </div>
        </div>

        <h2 className="mt-12 text-[20px] font-semibold text-slate-900 dark:text-white">
          Published books
        </h2>
        {books && books.length > 0 ? (
          <div className="mt-6 flex flex-wrap gap-6">
            {books.map((book) => (
              <BookCard
                key={book.id}
                id={book.id}
                title={book.title}
                author={displayName}
                cover={book.cover_image}
              />
            ))}
          </div>
        ) : (
          <p className="mt-4 text-[14px] text-slate-500 dark:text-white/50">
            No published books yet.
          </p>
        )}
      </section>
    </main>
  );
}
