import { redirect } from "next/navigation";

/**
 * Legacy /author/write route — redirects to the new book workspace.
 * Keeps old bookmarks and links working.
 */
export default async function AuthorWriteRedirect({
  searchParams,
}: {
  searchParams?: Promise<{ book?: string; bookId?: string; lang?: string }>;
}) {
  const query = searchParams ? await searchParams : undefined;
  const bookId = query?.bookId?.trim() || query?.book?.trim() || null;

  if (bookId) {
    const langParam = query?.lang ? `&lang=${query.lang}` : "";
    redirect(`/author/books/${bookId}?panel=edit${langParam}`);
  }

  redirect("/author/library");
}
