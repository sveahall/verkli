import Link from "next/link";

import EmptyState from "@/components/reader/EmptyState";
import PageHeader from "@/components/reader/PageHeader";

const bookmarks = [
  {
    id: "bookmark-1",
    title: "Chapter 8: The Lighthouse Passage",
    book: "Midnight Atlas",
    note: "Stop here for the cliffhanger about the missing map.",
    time: "Saved 2 days ago",
  },
  {
    id: "bookmark-2",
    title: "Quote: 'We carry the storm with us'",
    book: "Soft Edges",
    note: "Use this line for the reading journal entry.",
    time: "Saved last week",
  },
  {
    id: "bookmark-3",
    title: "Chapter 4: Harbor signals",
    book: "The Glass Tide",
    note: "Revisit when the crew talks about the cove.",
    time: "Saved 3 weeks ago",
  },
];

export default function ReaderBookmarksPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Bookmarks"
        title="Saved moments"
        subtitle="Keep the lines, chapters, and ideas you want to return to."
        actions={
          <Link
            href="/reader/library"
            className="inline-flex min-h-[40px] items-center rounded-full border border-slate-200/80 bg-white/80 px-4 py-2 text-[13px] font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-white/70 dark:hover:text-white"
          >
            Back to library
          </Link>
        }
      />

      {bookmarks.length === 0 ? (
        <EmptyState
          title="No bookmarks yet"
          description="Save highlights or chapters and they will appear here."
          action={
            <Link
              href="/reader/home"
              className="inline-flex min-h-[40px] items-center rounded-full bg-slate-900 px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900"
            >
              Continue reading
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4">
          {bookmarks.map((item) => (
            <div
              key={item.id}
              className="rounded-2xl border border-slate-200/70 bg-white/80 px-5 py-5 shadow-[0_8px_24px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-white/5"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-[12px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/50">
                  {item.book}
                </span>
                <span className="text-[12px] text-slate-400 dark:text-white/40">{item.time}</span>
              </div>
              <h3 className="mt-3 text-[16px] font-semibold text-slate-900 dark:text-white">
                {item.title}
              </h3>
              <p className="mt-2 text-[14px] text-slate-600 dark:text-white/70">{item.note}</p>
              <div className="mt-4 flex items-center gap-3">
                <Link
                  href="/reader/home"
                  className="text-[12px] font-semibold text-slate-700 hover:text-slate-900 dark:text-white/70 dark:hover:text-white"
                >
                  Open book
                </Link>
                <button
                  type="button"
                  className="text-[12px] font-medium text-slate-400 hover:text-slate-600 dark:text-white/40 dark:hover:text-white/60"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
