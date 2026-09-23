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
    <section className="rounded-2xl border border-border bg-card px-7 py-5 shadow-[0_2px_10px_rgba(25,23,28,0.025)] dark:bg-card">
      <h2 className="author-section-title text-xl font-normal text-foreground dark:text-foreground">Recent activity</h2>

      {items.length > 0 ? (
        <div className="mt-4 space-y-4">
          {items.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className="flex items-start justify-between gap-4 rounded-lg py-2 transition hover:bg-background/70 dark:hover:bg-accent"
            >
              <div className="flex min-w-0 gap-3">
                <span
                  aria-hidden="true"
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#907AFF]"
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground dark:text-foreground">
                    {item.title}
                  </p>
                  <p className="mt-0.5 truncate text-sm text-muted-foreground dark:text-muted-foreground">
                    {item.bookName}
                  </p>
                </div>
              </div>
              <span className="shrink-0 pt-0.5 text-sm text-muted-foreground dark:text-muted-foreground">
                {item.timestamp}
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-lg border border-dashed border-border bg-background/80 p-6 text-sm text-muted-foreground dark:border-border dark:bg-card dark:text-muted-foreground">
          <p className="font-medium text-foreground">No recent activity yet.</p>
          <p className="mt-1">Your translations, audiobook production and published books will appear here.</p>
        </div>
      )}
    </section>
  );
}
