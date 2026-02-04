import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CreateBookForm from "./CreateBookForm";
import BookListClient from "./BookListClient";
import { PageHeader } from "@/components/ui/page-header";
import { ErrorState } from "@/components/ui/states";

export default async function AuthorBooksPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/author/signin");
  }

  const { data: books, error } = await supabase
    .from("books")
    .select("id, title, status, updated_at")
    .eq("author_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    return (
      <main className="page-content py-10">
        <ErrorState
          title="Couldn&apos;t load books"
          description="Refresh the page or try again in a moment."
          action={
            <Link href="/author/books" className="btn-secondary">
              Retry
            </Link>
          }
        />
      </main>
    );
  }

  return (
    <main className="page-content py-10">
      <div className="section-gap">
        <PageHeader
          title="Books"
          description="Manage drafts, translations, and publishing in one place."
          actions={
            <Link href="#create-book" className="btn-primary">
              Create book
            </Link>
          }
        />

        <BookListClient books={books ?? []} />

        <CreateBookForm />
      </div>
    </main>
  );
}
