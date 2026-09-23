import { redirect } from "next/navigation";

export default async function ReaderWriterRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/reader/authors/${id}`);
}
