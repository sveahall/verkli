import { redirect } from "next/navigation";

export default async function BookOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/author/write?bookId=${id}`);
}
