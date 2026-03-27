"use client";

// ─── Sub-components for StatisticsPanel ──────────────────────────────────

export type DailyPoint = {
  date: string;
  views: number;
  reads: number;
};

export type StatsData = {
  overview: {
    views: number;
    reads: number;
    purchases: number;
    bookmarks: number;
    revenue: number;
    currency: string;
  };
  readers: {
    total: number;
    active: number;
    avgProgress: number;
    completionRate: number;
  };
  reviews: {
    count: number;
    averageRating: number;
    recent: Array<{ rating: number; content: string | null; created_at: string }>;
  };
  dailyChart: DailyPoint[];
};

export function ProgressRing({
  value,
  size = 56,
  stroke = 5,
  color = "#907AFF",
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(Math.max(value, 0), 100);
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-slate-100 dark:stroke-white/[0.08]"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={c - (pct / 100) * c}
          strokeLinecap="round"
          stroke={color}
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[13px] font-bold tabular-nums text-slate-900 dark:text-white">
        {pct}%
      </span>
    </div>
  );
}

const CHART_STYLE = { height: 72 } as const;
const BAR_COL_STYLE = { minWidth: 3, maxWidth: 18, height: "100%" } as const;

export function MiniBarChart({ data }: { data: DailyPoint[] }) {
  if (data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.views + d.reads), 1);

  return (
    <div className="flex items-end gap-[3px]" style={CHART_STYLE}>
      {data.map((d) => {
        const total = d.views + d.reads;
        const h = (total / max) * 100;
        const readsPct = total > 0 ? (d.reads / total) * h : 0;
        const viewsPct = h - readsPct;
        return (
          <div
            key={d.date}
            className="group relative flex flex-1 flex-col justify-end"
            style={BAR_COL_STYLE}
          >
            <div className="pointer-events-none absolute -top-9 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1 text-[10px] font-medium text-white shadow-lg group-hover:block dark:bg-white dark:text-slate-900">
              {d.date.slice(5)} &middot; {d.views} visn. &middot; {d.reads} läsn.
            </div>
            <div
              className="w-full rounded-t-sm bg-[#907AFF]/40"
              style={{ height: `${readsPct}%`, minHeight: readsPct > 0 ? 2 : 0 }}
            />
            <div
              className="w-full bg-[#907AFF] transition-all group-hover:bg-[#7c6ae6]"
              style={{
                height: `${viewsPct}%`,
                minHeight: viewsPct > 0 ? 2 : 0,
                borderRadius: readsPct > 0 ? 0 : "2px 2px 0 0",
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

export function Stars({ rating, size = 13 }: { rating: number; size?: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <svg
          key={s}
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill={s <= rating ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth={1.5}
          className={s <= rating ? "text-amber-400" : "text-slate-200 dark:text-white/10"}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z"
          />
        </svg>
      ))}
    </div>
  );
}

export function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-5 py-4 text-center">
      <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
        {value}
      </p>
      <p className="mt-0.5 text-[11px] font-medium text-slate-400 dark:text-white/35">
        {label}
      </p>
    </div>
  );
}

export function InsightCard({ data }: { data: StatsData }) {
  const insights: { icon: string; text: string; color: string }[] = [];

  if (data.reviews.averageRating >= 4 && data.reviews.count >= 2) {
    insights.push({
      icon: "star",
      text: `Snittbetyg ${data.reviews.averageRating}/5 baserat på ${data.reviews.count} recensioner.`,
      color: "amber",
    });
  }

  if (data.readers.total >= 5 && data.readers.completionRate >= 50) {
    insights.push({
      icon: "check",
      text: `${data.readers.completionRate}% av läsarna slutför boken — stark retention.`,
      color: "emerald",
    });
  }

  if (data.readers.active > 0) {
    insights.push({
      icon: "user",
      text: `${data.readers.active} aktiv${data.readers.active === 1 ? "" : "a"} läsare den senaste veckan.`,
      color: "blue",
    });
  }

  if (data.overview.bookmarks >= 3) {
    insights.push({
      icon: "bookmark",
      text: `${data.overview.bookmarks} läsare har sparat boken.`,
      color: "purple",
    });
  }

  if (data.readers.total >= 5 && data.readers.completionRate < 25) {
    insights.push({
      icon: "info",
      text: `${data.readers.completionRate}% slutförda — överväg att se över de första kapitlen.`,
      color: "amber",
    });
  }

  if (insights.length === 0) return null;

  const colorMap: Record<string, string> = {
    emerald: "border-emerald-200/50 bg-emerald-50/50 dark:border-emerald-500/15 dark:bg-emerald-500/5",
    amber: "border-amber-200/50 bg-amber-50/50 dark:border-amber-500/15 dark:bg-amber-500/5",
    blue: "border-blue-200/50 bg-blue-50/50 dark:border-blue-500/15 dark:bg-blue-500/5",
    purple: "border-[#907AFF]/15 bg-[#907AFF]/[0.04] dark:border-[#907AFF]/15 dark:bg-[#907AFF]/5",
  };

  const textColor: Record<string, string> = {
    emerald: "text-emerald-700 dark:text-emerald-400",
    amber: "text-amber-700 dark:text-amber-400",
    blue: "text-blue-700 dark:text-blue-400",
    purple: "text-[#6C5CE7] dark:text-[#b8a9ff]",
  };

  return (
    <div className="space-y-2">
      {insights.slice(0, 2).map((ins, i) => (
        <div
          key={i}
          className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${colorMap[ins.color]}`}
        >
          <svg
            className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${textColor[ins.color]}`}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            {ins.icon === "star" && (
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
            )}
            {ins.icon === "check" && (
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            )}
            {ins.icon === "user" && (
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
            )}
            {ins.icon === "bookmark" && (
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" />
            )}
            {ins.icon === "info" && (
              <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
            )}
          </svg>
          <span className={`text-[13px] leading-snug ${textColor[ins.color]}`}>
            {ins.text}
          </span>
        </div>
      ))}
    </div>
  );
}
