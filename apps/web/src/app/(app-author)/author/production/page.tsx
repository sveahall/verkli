import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ProductionWorkspace from "@/features/author-workspaces/production/ProductionWorkspace";

export default async function AuthorProductionPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  void (searchParams ? await searchParams : undefined);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/author/signin");
  }

  const [{ data: books }, { data: profile }] = await Promise.all([
    supabase
      .from("books")
      .select("id, title, status, updated_at, cover_image, audiobook_status")
      .eq("author_id", user.id)
      .order("updated_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("display_name")
      .eq("user_id", user.id)
      .single(),
  ]);
  const authorName = profile?.display_name || user.user_metadata?.full_name || null;

  const bookIds = (books ?? []).map((b) => b.id);

  const [{ data: chapters }, { data: translations }] =
    bookIds.length > 0
      ? await Promise.all([
          supabase
            .from("chapters")
            .select("book_id")
            .in("book_id", bookIds),
          supabase
            .from("translations")
            .select("original_book_id")
            .in("original_book_id", bookIds),
        ])
      : [
          { data: [] as { book_id: string }[] },
          { data: [] as { original_book_id: string }[] },
        ];

  const chapterCountMap = new Map<string, number>();
  (chapters ?? []).forEach((ch) => {
    chapterCountMap.set(ch.book_id, (chapterCountMap.get(ch.book_id) ?? 0) + 1);
  });

  const translationCountMap = new Map<string, number>();
  (translations ?? []).forEach((t) => {
    translationCountMap.set(
      t.original_book_id,
      (translationCountMap.get(t.original_book_id) ?? 0) + 1,
    );
  });

  return (
    <ProductionWorkspace
      books={(books ?? []).map((book) => ({
        id: book.id,
        title: book.title ?? "Untitled",
        status: book.status ?? "DRAFT",
        updatedAt: book.updated_at ?? null,
        coverImageUrl: book.cover_image ?? null,
        audiobookStatus: book.audiobook_status ?? null,
        chapterCount: chapterCountMap.get(book.id) ?? 0,
        translationCount: translationCountMap.get(book.id) ?? 0,
        authorDisplayName: authorName ?? undefined,
      }))}
    />
  );
}
