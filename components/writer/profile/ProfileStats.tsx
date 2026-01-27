const statColors = ["#907AFF", "#E29ED5", "#FCC997"];

type ProfileStatsProps = {
  books: number;
  shelves: number;
  reads: number | null;
};

export default function ProfileStats({ books, shelves, reads }: ProfileStatsProps) {
  const stats = [
    { label: "Books", value: books.toLocaleString() },
    { label: "Shelves", value: shelves.toLocaleString() },
    { label: "Total reads", value: reads === null ? "--" : reads.toLocaleString() },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {stats.map((stat, index) => (
        <div
          key={stat.label}
          className="relative overflow-hidden rounded-[24px] border border-black/10 bg-gradient-to-br from-black/[0.04] to-transparent px-6 py-5 dark:border-white/[0.08] dark:from-white/[0.05]"
        >
          <div
            className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full opacity-30 blur-3xl"
            style={{ background: statColors[index % statColors.length] }}
          />
          <div className="relative">
            <p className="text-[12px] font-semibold uppercase tracking-[0.3em] text-slate-500 dark:text-white/40">
              {stat.label}
            </p>
            <div className="mt-3 text-[28px] font-semibold text-slate-900 dark:text-white">
              {stat.value}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
