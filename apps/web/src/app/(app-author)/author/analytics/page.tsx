import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AnalyticsWorkspace from "@/features/author-workspaces/analytics/AnalyticsWorkspace";

export default async function AnalyticsPage({
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
    .select("id, title")
    .eq("author_id", user.id)
    .order("updated_at", { ascending: false });

  return (
    <AnalyticsWorkspace
      books={(books ?? []).map((book) => ({
        id: book.id,
        title: book.title ?? "Untitled",
      }))}
    />
  );
}
