import { redirect } from "next/navigation";

export default async function AuthorPublishRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/author/audience?bookId=${id}&surface=beta-readers`);
}
