import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import BookCard from "@/components/reader/BookCard";
import EmptyState from "@/components/reader/EmptyState";
import PageHeader from "@/components/reader/PageHeader";
import Rail from "@/components/reader/Rail";
import { ErrorBannerWrapper } from "@/components/ui/ErrorBanner";
import AuthorApplicationCard from "./AuthorApplicationCard";

export default async function ReaderHomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let authorApplicationStatus: "none" | "pending" | "approved" | "rejected" = "none";

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    // SECURITY: Only trust profiles.role — user_metadata is client-writable.
    const profileRole = String(profile?.role ?? "").toLowerCase();

    if (profileRole === "author") {
      authorApplicationStatus = "approved";
    } else {
      const { data: application } = await supabase
        .from("author_applications" as never)
        .select("status")
        .eq("user_id", user.id)
        .maybeSingle();

      const status = String((application as { status?: string } | null)?.status ?? "").toLowerCase();
      if (status === "pending" || status === "approved" || status === "rejected") {
        authorApplicationStatus = status;
      }
    }
  }

  // Continue reading: user's readings with book + author
  let continueReading: {
    id: string;
    title: string;
    author: string;
    cover: string | null;
    progress: number;
    href: string;
  }[] = [];
  if (user) {
    const { data: readings } = await supabase
      .from("readings")
      .select("book_id, progress_percent, updated_at, chapter_id")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(8);

    if (readings && readings.length > 0) {
      const bookIds = readings.map((r) => r.book_id);
      const { data: books } = await supabase
        .from("books")
        .select("id, title, cover_image, author_id")
        .eq("status", "PUBLISHED")
        .in("id", bookIds);

      if (books && books.length > 0) {
        const bookMap = new Map(books.map((b) => [b.id, b]));
        const authorIds = [...new Set(books.map((b) => b.author_id))];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, display_name, username")
          .in("user_id", authorIds);
        const authorMap = new Map(
          (profiles ?? []).map((p) => [
            p.user_id,
            p.display_name || p.username || "Author",
          ])
        );

        continueReading = readings
          .map((r) => {
            const book = bookMap.get(r.book_id);
            if (!book) return null;
            const directHref = r.chapter_id ? `/reader/read/${r.chapter_id}` : `/reader/books/${book.id}`;
            return {
              id: book.id,
              title: book.title,
              author: authorMap.get(book.author_id) ?? "Author",
              cover: book.cover_image,
              progress: r.progress_percent ?? 0,
              href: directHref,
            };
          })
          .filter((b): b is NonNullable<typeof b> => b !== null);
      }
    }
  }

  // Published books (latest) – same as discover
  const { data: books } = await supabase
    .from("books")
    .select("id, title, cover_image, author_id")
    .eq("status", "PUBLISHED")
    .order("updated_at", { ascending: false })
    .limit(12);

  const publishedWithAuthors = await Promise.all(
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
      <ErrorBannerWrapper />
      <PageHeader
        eyebrow="Reader"
        title="Welcome back"
        description="Pick up where you left off, then explore what your community is reading next."
        actions={
          <Link href="/reader/discover" className="btn-secondary">
            Browse discover
          </Link>
        }
      />

      {user && authorApplicationStatus !== "approved" ? (
        <AuthorApplicationCard initialStatus={authorApplicationStatus} />
      ) : null}

      <Rail
        title="Continue reading"
        description="Your open chapters, ready when you are"
        isEmpty={continueReading.length === 0}
        emptyState={
          <EmptyState
            title="Your shelf is quiet"
            description="Start a book and it will appear here with progress tracking."
            action={
              <Link
                href="/reader/discover"
                className="btn-primary rounded-full bg-slate-900 px-5 py-2.5 text-[14px] hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-white/95"
              >
                Explore stories
              </Link>
            }
          />
        }
      >
        {continueReading.map((book) => (
          <BookCard
            key={book.id}
            id={book.id}
            title={book.title}
            author={book.author}
            cover={book.cover}
            progress={book.progress}
            href={book.href}
            ctaLabel="Continue"
            size="lg"
          />
        ))}
      </Rail>

      <Rail
        title="Published books"
        description="Latest public releases"
        action={
          <Link href="/reader/discover" className="btn-ghost py-1.5 text-[13px]">
            See all
          </Link>
        }
        isEmpty={publishedWithAuthors.length === 0}
        emptyState={
          <p className="text-[14px] text-slate-500 dark:text-white/50">
            No published books yet. Check back soon.
          </p>
        }
      >
        {publishedWithAuthors.map((book) => (
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
