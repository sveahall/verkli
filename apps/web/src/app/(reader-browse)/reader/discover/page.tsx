import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAvatarUrlFromPathServer } from "@/lib/supabase/avatar";
import AuthorCard from "@/components/reader/AuthorCard";
import BookCard from "@/components/reader/BookCard";
import PageHeader from "@/components/reader/PageHeader";
import Rail from "@/components/reader/Rail";

export default async function ReaderDiscoverPage() {
  const supabase = await createClient();

  // Public writers (is_public = true, role = writer)
  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, display_name, username, avatar_url, bio")
    .eq("role", "writer")
    .eq("is_public", true)
    .limit(12);

  const writersWithAvatars = await Promise.all(
    (profiles ?? []).map(async (p) => ({
      id: p.user_id,
      name: p.display_name || p.username || "Writer",
      genre: "Storyteller",
      avatar: await getAvatarUrlFromPathServer(p.avatar_url),
      href: `/reader/writers/${p.user_id}`,
    }))
  );

  // Published books with author info (status = PUBLISHED)
  const { data: books } = await supabase
    .from("books")
    .select("id, title, cover_image, author_id")
    .eq("status", "PUBLISHED")
    .order("updated_at", { ascending: false })
    .limit(16);

  const booksWithAuthors = await Promise.all(
    (books ?? []).map(async (book) => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, username")
        .eq("user_id", book.author_id)
        .maybeSingle();
      return {
        id: book.id,
        title: book.title,
        author: profile?.display_name || profile?.username || "Author",
        cover: book.cover_image,
      };
    })
  );

  return (
    <div className="section-gap-lg">
      <PageHeader
        eyebrow="Discover"
        title="Find your next read"
        subtitle="Browse public writers and their published books. No signup required."
      />

      {writersWithAvatars.length > 0 && (
        <section className="space-y-5">
          <h2 className="text-section-title">Public writers</h2>
          <div className="grid gap-6 md:grid-cols-2">
            {writersWithAvatars.map((writer) => (
              <AuthorCard
                key={writer.id}
                name={writer.name}
                genre={writer.genre}
                avatar={writer.avatar}
                href={writer.href}
              />
            ))}
          </div>
        </section>
      )}

      <Rail
        title="Published books"
        subtitle="Latest public releases"
        isEmpty={booksWithAuthors.length === 0}
        emptyState={
          <p className="text-[14px] text-slate-500 dark:text-white/50">
            No published books yet. Check back soon.
          </p>
        }
      >
        {booksWithAuthors.map((book) => (
          <BookCard
            key={book.id}
            id={book.id}
            title={book.title}
            author={book.author}
            cover={book.cover}
          />
        ))}
      </Rail>
    </div>
  );
}
