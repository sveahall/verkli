import { redirect } from "next/navigation";

// Production is now merged into Library.
// Any direct link to /author/production redirects seamlessly.
export default async function AuthorProductionPage({
  searchParams,
}: {
  searchParams?: Promise<{ bookId?: string; kind?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const bookId = params?.bookId?.trim();
  const kind = params?.kind?.trim();

  if (bookId) {
    const panel = kind === "audiobook" || kind === "translation" ? `?panel=${kind}` : "";
    redirect(`/author/books/${bookId}${panel}`);
  }

  redirect("/author/library");
}
