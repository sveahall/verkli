import Link from "next/link";

export type ActivityListItem = {
  id: string;
  title: string;
  bookName: string;
  timestamp: string;
  href: string;
};

type ActivityListProps = {
  items: ActivityListItem[];
};

export default function ActivityList({ items }: ActivityListProps) {
  return (
    <section className="rounded-2xl bg-white px-7 py-5 dark:bg-white/[0.04]">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Recent activity</h2>

      {items.length > 0 ? (
        <div className="mt-4 space-y-4">
          {items.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className="flex items-start justify-between gap-4 rounded-lg py-0.5 transition hover:bg-slate-50/70 dark:hover:bg-white/[0.03]"
            >
              <div className="flex min-w-0 gap-3">
                <span
                  aria-hidden="true"
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#7C6CFF]"
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    {item.title}
                  </p>
                  <p className="mt-0.5 truncate text-sm text-slate-500 dark:text-white/45">
                    {item.bookName}
                  </p>
                </div>
              </div>
              <span className="shrink-0 pt-0.5 text-sm text-slate-500 dark:text-white/45">
                {item.timestamp}
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-lg border border-dashed border-slate-200 bg-slate-50/80 p-6 text-sm text-slate-600 dark:border-white/10 dark:bg-white/[0.02] dark:text-white/50">
          No recent activity yet.
        </div>
      )}
    </section>
  );
}
