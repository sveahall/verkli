import Link from "next/link";

import BookCard from "@/components/reader/BookCard";
import PageHeader from "@/components/reader/PageHeader";
import Rail from "@/components/reader/Rail";

const stats = [
  { label: "Hours read", value: "42" },
  { label: "Books finished", value: "18" },
  { label: "Streak", value: "7 days" },
];

const recentReads = [
  {
    id: "midnight-atlas",
    title: "Midnight Atlas",
    author: "Lina Ko",
    cover:
      "https://images.unsplash.com/photo-1512820790803-83ca734da794?w=600&auto=format&fit=crop&q=80",
    progress: 62,
  },
  {
    id: "soft-edges",
    title: "Soft Edges",
    author: "Will Hart",
    cover:
      "https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=600&auto=format&fit=crop&q=80",
    progress: 88,
  },
  {
    id: "quiet-noon",
    title: "Quiet Noon",
    author: "Owen Price",
    cover:
      "https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=600&auto=format&fit=crop&q=80",
    progress: 24,
  },
];

export default function ReaderProfilePage() {
  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Profile"
        title="Your reader space"
        subtitle="Track your reading rhythm, manage lists, and tailor your experience."
        actions={
          <Link
            href="/reader/settings"
            className="inline-flex min-h-[40px] items-center rounded-full bg-slate-900 px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900"
          >
            Settings
          </Link>
        }
      />

      <section className="rounded-3xl border border-slate-200/70 bg-white/80 p-6 shadow-[0_16px_30px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-white/5">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-5">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-900 text-[20px] font-semibold text-white dark:bg-white dark:text-slate-900">
              RK
            </div>
            <div>
              <p className="text-[18px] font-semibold text-slate-900 dark:text-white">Riley Kent</p>
              <p className="text-[13px] text-slate-500 dark:text-white/60">Reader since 2024 · Oslo, NO</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/reader/bookmarks"
              className="inline-flex min-h-[40px] items-center rounded-full border border-slate-200/80 bg-white/80 px-4 py-2 text-[13px] font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-white/70 dark:hover:text-white"
            >
              Bookmarks
            </Link>
            <Link
              href="/reader/community"
              className="inline-flex min-h-[40px] items-center rounded-full border border-slate-200/80 bg-white/80 px-4 py-2 text-[13px] font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-white/70 dark:hover:text-white"
            >
              Community
            </Link>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl border border-slate-200/60 bg-white/80 px-4 py-4 text-left dark:border-white/10 dark:bg-white/5"
            >
              <p className="text-[12px] text-slate-500 dark:text-white/60">{stat.label}</p>
              <p className="mt-2 text-[18px] font-semibold text-slate-900 dark:text-white">
                {stat.value}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200/60 bg-white/80 px-4 py-4 dark:border-white/10 dark:bg-white/5">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-medium text-slate-700 dark:text-white/70">Weekly goal</p>
            <span className="text-[12px] text-slate-500 dark:text-white/50">3 of 5 hours</span>
          </div>
          <div className="mt-3 h-2 w-full rounded-full bg-slate-200/80 dark:bg-white/10">
            <div className="h-full w-[60%] rounded-full bg-slate-900 dark:bg-white" />
          </div>
        </div>
      </section>

      <Rail title="Recently opened" subtitle="Jump back into your latest reads">
        {recentReads.map((book) => (
          <BookCard
            key={book.id}
            id={book.id}
            title={book.title}
            author={book.author}
            cover={book.cover}
            progress={book.progress}
            size="lg"
          />
        ))}
      </Rail>
    </div>
  );
}
