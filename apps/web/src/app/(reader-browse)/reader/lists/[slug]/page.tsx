import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BookCard from "@/components/reader/BookCard";
import PageHeader from "@/components/reader/PageHeader";

export default async function ReaderListPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: list, error: listError } = await supabase
    .from("curated_lists")
    .select("id, slug, title, description, language")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (listError || !list) {
    notFound();
  }

  const { data: items } = await supabase
    .from("curated_list_items")
    .select("book_id, rank")
    .eq("list_id", list.id)
    .order("rank", { ascending: true });

  if (!items?.length) {
    return (
      <div className="section-gap-lg">
        <PageHeader
          eyebrow="Curated list"
          title={list.title}
          subtitle={list.description ?? undefined}
        />
        <p className="text-body text-slate-600 dark:text-white/60">No books in this list yet.</p>
        <Link
          href="/reader/discover"
          className="mt-4 inline-block text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:underline"
        >
          ← Back to discover
        </Link>
      </div>
    );
  }

  const bookIds = items.map((i) => i.book_id);
  const { data: books } = await supabase
    .from("books")
    .select("id, title, cover_image, author_id")
    .eq("status", "PUBLISHED")
    .in("id", bookIds);

  const bookMap = new Map((books ?? []).map((b) => [b.id, b]));
  const orderedBooks = items
    .map((i) => bookMap.get(i.book_id))
    .filter(Boolean) as Array<{ id: string; title: string; cover_image: string | null; author_id: string }>;

  const withAuthors = await Promise.all(
    orderedBooks.map(async (book) => {
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
        eyebrow="Curated list"
        title={list.title}
        subtitle={list.description ?? undefined}
      />

      <Link
        href="/reader/discover"
        className="mb-6 inline-block text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-white/60 dark:hover:text-white"
      >
        ← Back to discover
      </Link>

      <section className="space-y-5">
        <h2 className="sr-only">Books in this list</h2>
        <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {withAuthors.map((book) => (
            <BookCard
              key={book.id}
              id={book.id}
              title={book.title}
              author={book.author}
              cover={book.cover}
              layout="grid"
            />
          ))}
        </div>
      </section>
    </div>
  );
}
