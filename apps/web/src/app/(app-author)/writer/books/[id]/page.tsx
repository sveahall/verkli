import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BookEditor from "./BookEditor";

export default async function BookDetailPage({ params }: { params: Promise<{ id: string }> }) {
  // Next.js 16+: params is a Promise, must await
  const { id } = await params;
  
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/writer/signin");
  }

  const { data: book } = await supabase
    .from("books")
    .select("id, title, description, cover_image, author_id, status")
    .eq("id", id)
    .maybeSingle();

  if (!book || book.author_id !== user.id) {
    notFound();
  }

  const { data: chapters } = await supabase
    .from("chapters")
    .select("id, title, content, order")
    .eq("book_id", book.id)
    .order("order", { ascending: true });

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="mx-auto max-w-[1200px] px-6 pt-10">
        <Link
          href="/writer/home"
          className="inline-flex items-center gap-2 text-sm text-slate-500 transition-colors hover:text-slate-900 dark:text-white/60 dark:hover:text-white"
        >
          <span aria-hidden="true">←</span>
          Back to library
        </Link>
      </header>

      <BookEditor book={book} chapters={chapters ?? []} />
    </main>
  );
}
