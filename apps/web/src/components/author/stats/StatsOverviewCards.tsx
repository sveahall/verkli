"use client";

type StatsOverviewCardsProps = {
  views: number;
  reads: number;
  revenue: number;
  publishedBooks: number;
  currency: string;
};

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/50 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#907AFF]/10 text-[#907AFF]">
          {icon}
        </div>
        <div>
          <p className="text-[12px] font-medium text-slate-500 dark:text-white/50">
            {label}
          </p>
          <p className="text-xl font-bold text-slate-900 dark:text-white">
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function StatsOverviewCards({
  views,
  reads,
  revenue,
  publishedBooks,
  currency,
}: StatsOverviewCardsProps) {
  const formatNumber = (n: number) =>
    n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

  const formatRevenue = (n: number) =>
    `${n.toLocaleString("sv-SE")} ${currency}`;

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatCard
        icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7Z" />
          </svg>
        }
        label="Visningar"
        value={formatNumber(views)}
      />
      <StatCard
        icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 5.5h11a3 3 0 013 3v10H8a3 3 0 00-3 3v-16z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 18.5h11" />
          </svg>
        }
        label="Läsningar"
        value={formatNumber(reads)}
      />
      <StatCard
        icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v20M17 5H9.5a3.5 3.5 0 1 0 0 7h5a3.5 3.5 0 1 1 0 7H6" />
          </svg>
        }
        label="Intäkter"
        value={formatRevenue(revenue)}
      />
      <StatCard
        icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 5.5h11a3 3 0 013 3v10H8a3 3 0 00-3 3v-16z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 18.5h11" />
          </svg>
        }
        label="Publicerade böcker"
        value={String(publishedBooks)}
      />
    </div>
  );
}
