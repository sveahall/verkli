import { redirect } from "next/navigation";

// Production is now merged into Library.
// Any direct link to /author/production redirects seamlessly.
export default function AuthorProductionPage() {
  redirect("/author/library");
}
