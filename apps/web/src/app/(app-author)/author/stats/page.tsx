<<<<<<< HEAD
import Link from "next/link";
import EmptyState from "@/components/reader/EmptyState";

export default function AuthorStatsPage() {
  return (
    <div className="mx-auto max-w-[600px] px-6 py-12">
      <EmptyState
        title="No stats yet"
        description="Publish a book and get readers to see your stats here."
        action={
          <Link
            href="/author/books"
            className="inline-flex min-h-[40px] items-center rounded-full bg-slate-900 px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900"
          >
            Go to books
          </Link>
        }
      />
    </div>
=======
import PlaceholderPage from "@/components/PlaceholderPage";
import { NAV_CONFIG } from "@/nav/navConfig";

export default function Page() {
  return (
    <PlaceholderPage
      title="Stats"
      variantLabel="Author"
      links={NAV_CONFIG.APP_AUTHOR.links}
      showAuthStatus={true}
    />
>>>>>>> main
  );
}
