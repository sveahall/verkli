import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LibraryWorkspace from "@/features/author-workspaces/library/LibraryWorkspace";

export default async function AuthorLibraryPage({
  searchParams,
}: {
  searchParams?: Promise<{ action?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/author/signin");
  }

  const { data: books } = await supabase
    .from("books")
    .select("id, title, description, status, updated_at, cover_image, audiobook_status")
    .eq("author_id", user.id)
    .order("updated_at", { ascending: false });

  const bookIds = (books ?? []).map((b) => b.id);

  const { data: chapterRows } = bookIds.length > 0
    ? await supabase
        .from("chapters")
        .select("book_id")
        .in("book_id", bookIds)
    : { data: [] };

  const chapterCountMap: Record<string, number> = {};
  for (const ch of chapterRows ?? []) {
    chapterCountMap[ch.book_id] = (chapterCountMap[ch.book_id] ?? 0) + 1;
  }

  return (
    <LibraryWorkspace
      books={(books ?? []).map((book) => ({
        id: book.id,
        title: book.title ?? "Untitled",
        description: book.description ?? null,
        status: book.status ?? "DRAFT",
        updatedAt: book.updated_at ?? null,
        coverImageUrl: book.cover_image ?? null,
        audiobookStatus: book.audiobook_status ?? null,
        chapterCount: chapterCountMap[book.id] ?? 0,
      }))}
      initialCreateOpen={resolvedSearchParams?.action === "create-book"}
    />
  );
}
