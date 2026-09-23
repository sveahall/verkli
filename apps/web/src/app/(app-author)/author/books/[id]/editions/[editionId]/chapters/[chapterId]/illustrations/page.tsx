import { notFound, redirect } from "next/navigation";
import { requireAuthorRole } from "@/lib/auth/require-author";
import { scopeKeySchema } from "@/features/illustration-candidates/contracts";
import AuthorCandidates from "@/features/illustration-candidates/AuthorCandidates";

export default async function Page({ params }: { params: Promise<{ id: string; editionId: string; chapterId: string }> }) {
  const author = await requireAuthorRole();
  if (!author.ok) redirect("/author/signin");
  const { id, editionId, chapterId } = await params;
  const parsed = scopeKeySchema.safeParse({ bookId: id, editionId, chapterId });
  if (!parsed.success) notFound();
  return <main className="p-4 sm:p-8"><AuthorCandidates key={`${author.user.id}:${id}:${editionId}:${chapterId}`} ownerId={author.user.id} scope={parsed.data} /></main>;
}
