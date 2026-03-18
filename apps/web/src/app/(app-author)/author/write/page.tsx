import { notFound } from "next/navigation";
import BookEditor from "@/app/(app-author)/author/books/[id]/BookEditor";
import { loadBookWorkspaceData } from "@/app/(app-author)/author/books/[id]/loadBookWorkspaceData";
import WorkflowEmptyState from "@/features/author-shell/WorkflowEmptyState";

export default async function AuthorWritePage({
  searchParams,
}: {
  searchParams?: Promise<{ book?: string; bookId?: string; lang?: string; intent?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const bookId =
    resolvedSearchParams?.bookId?.trim() ||
    resolvedSearchParams?.book?.trim() ||
    null;
  const lang = resolvedSearchParams?.lang?.trim() || null;

  if (!bookId) {
    return (
      <WorkflowEmptyState
        title="Choose a book to write"
        description="Open a draft from Library to get the chapter sidebar, distraction-free editor, and AI writing tools."
        primaryHref="/author/library"
        primaryLabel="Open library"
        secondaryHref="/author/library?action=create-book"
        secondaryLabel="Create book"
      />
    );
  }

  const data = await loadBookWorkspaceData(bookId, lang);
  if (!data) notFound();

  return (
    <BookEditor
      book={data.book}
      chapters={data.chapters}
      bookVersions={data.versions}
      activeVersion={data.activeVersion}
      authorDisplayName={data.authorDisplayName}
      latestAudiobookAsset={data.latestAudiobookAsset}
      marketingCampaigns={data.marketingCampaigns}
      stripeConfigured={data.stripeConfigured}
      visibleTools={["edit"]}
      initialTool="edit"
    />
  );
}
