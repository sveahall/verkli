import { redirect } from "next/navigation";

export default async function MarketingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/author/audience?bookId=${id}&surface=campaigns`);
}
