import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import WorkspaceNav from "./WorkspaceNav";

export default async function BookWorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let bookTitle = "Book";
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("books")
      .select("title")
      .eq("id", id)
      .maybeSingle();
    if (data?.title) bookTitle = data.title;
  } catch {
    // Non-blocking — nav still renders with fallback title
  }

  return (
    <div className="-mx-4 -mt-4 sm:-mx-6 lg:-mx-8 lg:-mt-6">
      <Suspense>
        <WorkspaceNav bookId={id} bookTitle={bookTitle} />
      </Suspense>
      <div className="px-4 pt-3 sm:px-6 lg:px-8 lg:pt-4">
        {children}
      </div>
    </div>
  );
}
