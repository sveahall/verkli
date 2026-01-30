import Link from "next/link";

import EmptyState from "@/components/reader/EmptyState";
import PageHeader from "@/components/reader/PageHeader";

const feedItems = [
  {
    id: "glass-tide-12",
    type: "New chapter",
    title: "The Glass Tide · Chapter 12 is live",
    author: "Marcus Vail",
    time: "2h ago",
    excerpt: "The harbor gate finally opens, and the tide reveals the missing map.",
    href: "/reader/books/glass-tide",
  },
  {
    id: "author-note",
    type: "Author note",
    title: "Lina Ko shared a note for Midnight Atlas",
    author: "Lina Ko",
    time: "Yesterday",
    excerpt: "Chapter 8 took me on a detour. Thank you for staying with the crew.",
    href: "/reader/books/midnight-atlas",
  },
  {
    id: "community-pick",
    type: "Community pick",
    title: "Readers are buzzing about Electric Fern",
    author: "Cleo Mar",
    time: "2 days ago",
    excerpt: "Sci-fi meets coastal mystery. The final scene is already trending.",
    href: "/reader/community",
  },
  {
    id: "collection",
    type: "Collection",
    title: "New collection: Quiet Winter Escapes",
    author: "Verkli editorial",
    time: "3 days ago",
    excerpt: "Snowy cabins, tender letters, and long nights. 18 books added.",
    href: "/reader/discover",
  },
];

export default function ReaderFeedPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Reader"
        title="Your feed"
        subtitle="Updates from authors, collections, and the stories you follow."
        actions={
          <Link
            href="/reader/library"
            className="inline-flex min-h-[40px] items-center rounded-full border border-slate-200/80 bg-white/80 px-4 py-2 text-[13px] font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-white/70 dark:hover:text-white"
          >
            Go to library
          </Link>
        }
      />

      {feedItems.length === 0 ? (
        <EmptyState
          title="No updates yet"
          description="Follow a few authors to see new chapters and announcements here."
          action={
            <Link
              href="/reader/discover"
              className="inline-flex min-h-[40px] items-center rounded-full bg-slate-900 px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900"
            >
              Discover authors
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4">
          {feedItems.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className="group rounded-2xl border border-slate-200/70 bg-white/80 px-5 py-5 shadow-[0_8px_24px_rgba(15,23,42,0.06)] transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_16px_32px_rgba(15,23,42,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#907AFF]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20 dark:hover:shadow-[0_14px_30px_rgba(0,0,0,0.35)] dark:focus-visible:ring-offset-[#0b0b12]"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-slate-900 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white dark:bg-white dark:text-slate-900">
                    {item.type}
                  </span>
                  <span className="text-[12px] text-slate-500 dark:text-white/50">{item.time}</span>
                </div>
                <span className="text-[12px] font-medium text-slate-500 transition group-hover:text-slate-700 dark:text-white/50 dark:group-hover:text-white">
                  Open
                </span>
              </div>
              <h3 className="mt-3 text-[16px] font-semibold text-slate-900 dark:text-white">
                {item.title}
              </h3>
              <p className="mt-1 text-[13px] text-slate-500 dark:text-white/60">{item.author}</p>
              <p className="mt-3 text-[14px] text-slate-600 dark:text-white/70">{item.excerpt}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
