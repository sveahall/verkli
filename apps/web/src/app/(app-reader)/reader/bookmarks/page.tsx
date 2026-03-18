import { redirect } from "next/navigation";

export default async function ReaderBookmarksPage() {
  redirect("/reader/library#saved-books");
}
