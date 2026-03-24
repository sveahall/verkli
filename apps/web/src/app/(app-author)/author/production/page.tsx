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

  const { data: books } = await supabase
    .from("books")
    .select("id, title, status, updated_at, cover_image, audiobook_status")
    .eq("author_id", user.id)
    .order("updated_at", { ascending: false });

  return (
    <ProductionWorkspace
      books={(books ?? []).map((book) => ({
        id: book.id,
        title: book.title ?? "Untitled",
        status: book.status ?? "DRAFT",
        updatedAt: book.updated_at ?? null,
        coverImageUrl: book.cover_image ?? null,
        audiobookStatus: book.audiobook_status ?? null,
      }))}
    />
  );
}
