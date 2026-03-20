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
    <section className="rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-slate-900">Recent activity</h2>

      {items.length > 0 ? (
        <div className="mt-5 space-y-3">
          {items.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className="flex items-start justify-between gap-4 rounded-lg py-1 transition hover:bg-slate-50/70"
            >
              <div className="flex min-w-0 gap-3">
                <span
                  aria-hidden="true"
                  className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-purple-500"
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">
                    {item.title}
                  </p>
                  <p className="mt-0.5 truncate text-sm text-slate-500">
                    {item.bookName}
                  </p>
                </div>
              </div>
              <span className="shrink-0 text-sm text-slate-500">
                {item.timestamp}
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-lg border border-dashed border-slate-200 bg-slate-50/80 p-6 text-sm text-slate-600">
          No recent activity yet.
        </div>
      )}
    </section>
  );
}
