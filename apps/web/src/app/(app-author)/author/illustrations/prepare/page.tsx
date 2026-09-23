import { redirect } from "next/navigation";
import { requireAuthorRole } from "@/lib/auth/require-author";
import AuthorPreparation from "@/features/illustration-preparation/AuthorPreparation";
export default async function Page() {
  const author = await requireAuthorRole();
  if (!author.ok) redirect("/author/signin");
  return <AuthorPreparation key={author.user.id} ownerId={author.user.id} />;
}
