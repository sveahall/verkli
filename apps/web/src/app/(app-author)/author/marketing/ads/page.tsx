import { redirect } from "next/navigation";

export default async function Page({ searchParams }: { searchParams: Promise<{ bookId?: string }> }) {
  const { bookId } = await searchParams;
  redirect(bookId ? `/author/marketing?bookId=${encodeURIComponent(bookId)}` : "/author/marketing");
}
