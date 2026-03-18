import { redirect } from "next/navigation";

export default async function WritePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ lang?: string }>;
}) {
  const { id } = await params;
  const query = searchParams ? await searchParams : undefined;
  const langParam = query?.lang ? `&lang=${query.lang}` : "";
  redirect(`/author/write?bookId=${id}${langParam}`);
}
