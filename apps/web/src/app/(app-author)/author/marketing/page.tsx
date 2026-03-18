import { redirect } from "next/navigation";

export default async function AuthorMarketingPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const rawSelectedBookId = resolvedSearchParams.bookId;
  const selectedBookId =
    typeof rawSelectedBookId === "string"
      ? rawSelectedBookId
      : Array.isArray(rawSelectedBookId)
        ? rawSelectedBookId[0] ?? null
        : null;

  if (selectedBookId) {
    redirect(`/author/audience?bookId=${selectedBookId}&surface=campaigns`);
  }

  redirect("/author/audience");
}
