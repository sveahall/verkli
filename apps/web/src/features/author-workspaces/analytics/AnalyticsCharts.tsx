"use client";

type DailyPoint = {
  date: string;
  views: number;
  reads: number;
  purchases: number;
};

type ChapterSignal = {
  id: string;
  title: string;
  readerCount: number;
  highlightCount: number;
  completionRate: number;
  dropoffRate: number;
  highlightRate: number;
};

type AnalyticsChartsProps = {
  dailyChart: DailyPoint[];
  chapterSignals: ChapterSignal[];
};

export default function AnalyticsCharts({
  dailyChart,
  chapterSignals,
}: AnalyticsChartsProps) {
  const maxDaily = Math.max(...dailyChart.map((point) => point.views + point.reads + point.purchases), 1);

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Activity</p>
            <p className="text-xs text-slate-500 dark:text-white/45">Views, reads, and conversion events over time.</p>
          </div>
        </div>
        {dailyChart.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-sm text-slate-500 dark:border-white/10 dark:text-white/45">
            No analytics events yet for this time window.
          </div>
        ) : (
          <div className="flex h-52 items-end gap-2">
            {dailyChart.map((point) => {
              const total = point.views + point.reads + point.purchases;
              const height = Math.max(12, Math.round((total / maxDaily) * 100));
              return (
                <div key={point.date} className="flex flex-1 flex-col items-center gap-2">
                  <div className="relative flex w-full flex-1 items-end">
                    <div className="w-full rounded-t-2xl bg-[#907AFF]" style={{ height: `${height}%` }} />
                  </div>
                  <span className="text-[11px] text-slate-400 dark:text-white/35">
                    {new Date(`${point.date}T00:00:00`).toLocaleDateString("sv-SE", {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
        <div className="mb-4">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">Chapter engagement signals</p>
          <p className="text-xs text-slate-500 dark:text-white/45">
            Reader dropoff, highlight rate, and completion strength by chapter.
          </p>
        </div>
        {chapterSignals.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-sm text-slate-500 dark:border-white/10 dark:text-white/45">
            Select a book with reader activity to inspect chapter-level signals.
          </div>
        ) : (
          <div className="space-y-3">
            {chapterSignals.slice(0, 8).map((signal, index) => (
              <div key={signal.id} className="rounded-2xl border border-slate-200 px-4 py-3 dark:border-white/10">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">
                      Chapter {index + 1} • {signal.title}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-white/45">
                      {signal.readerCount} readers • {signal.highlightCount} highlights
                    </p>
                  </div>
                  <span className="text-xs text-slate-400 dark:text-white/35">
                    {signal.completionRate}% completion
                  </span>
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-3">
                  <div>
                    <div className="mb-1 flex items-center justify-between text-[11px] text-slate-400 dark:text-white/35">
                      <span>Dropoff</span>
                      <span>{signal.dropoffRate}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                      <div className="h-full rounded-full bg-amber-400" style={{ width: `${Math.max(6, signal.dropoffRate)}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between text-[11px] text-slate-400 dark:text-white/35">
                      <span>Highlight rate</span>
                      <span>{signal.highlightRate}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                      <div className="h-full rounded-full bg-[#907AFF]" style={{ width: `${Math.max(6, signal.highlightRate)}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between text-[11px] text-slate-400 dark:text-white/35">
                      <span>Completion</span>
                      <span>{signal.completionRate}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(6, signal.completionRate)}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
