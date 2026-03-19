"use client";

type DailyPoint = {
  date: string;
  views: number;
  reads: number;
  purchases: number;
};

type AnalyticsChartsProps = {
  dailyChart: DailyPoint[];
};

export function buildLinePath(
  points: DailyPoint[],
  accessor: (point: DailyPoint) => number,
  maxValue: number
): string {
  if (points.length === 0) return "";
  return points
    .map((point, index) => {
      const x = points.length === 1 ? 50 : (index / (points.length - 1)) * 100;
      const y = 100 - (accessor(point) / maxValue) * 100;
      return `${x},${y}`;
    })
    .join(" ");
}

export default function AnalyticsCharts({ dailyChart }: AnalyticsChartsProps) {
  const maxDaily = Math.max(
    ...dailyChart.flatMap((point) => [point.views, point.reads, point.purchases]),
    1
  );
  const reachPath = buildLinePath(dailyChart, (point) => point.views, maxDaily);
  const readerPath = buildLinePath(dailyChart, (point) => point.reads, maxDaily);
  const purchasePath = buildLinePath(
    dailyChart,
    (point) => point.purchases,
    maxDaily
  );

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-eyebrow">Chart</p>
          <h3 className="mt-2 text-section-title">Reading over time</h3>
        </div>
        <div className="flex flex-wrap gap-3 text-sm text-slate-500 dark:text-white/45">
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-400" />
            Reach
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-900 dark:bg-white" />
            Readers
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
            Revenue events
          </span>
        </div>
      </div>

      {dailyChart.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-sm text-slate-500 dark:border-white/10 dark:text-white/45">
          No analytics events yet for this time window.
        </div>
      ) : (
        <div className="mt-6">
          <svg
            viewBox="0 0 100 100"
            className="h-64 w-full"
            preserveAspectRatio="none"
          >
            {[20, 40, 60, 80].map((value) => (
              <line
                key={value}
                x1="0"
                y1={value}
                x2="100"
                y2={value}
                stroke="currentColor"
                strokeWidth="0.4"
                className="text-slate-200 dark:text-white/10"
              />
            ))}
            <polyline
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              className="text-slate-400 dark:text-white/45"
              points={reachPath}
            />
            <polyline
              fill="none"
              stroke="currentColor"
              strokeWidth="2.8"
              className="text-slate-900 dark:text-white"
              points={readerPath}
            />
            <polyline
              fill="none"
              stroke="#f59e0b"
              strokeWidth="2.2"
              points={purchasePath}
            />
          </svg>

          <div className="mt-4 flex flex-wrap gap-x-8 gap-y-3 text-sm text-slate-500 dark:text-white/45">
            {dailyChart.slice(-3).map((point) => (
              <span key={point.date}>
                {new Date(`${point.date}T00:00:00`).toLocaleDateString("sv-SE", {
                  day: "numeric",
                  month: "short",
                })}
                {" · "}
                {point.reads} readers
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
