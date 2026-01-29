import type { Metric, ModuleState } from "@/lib/marketing/types";

const renderChartPlaceholder = () => (
  <div className="flex h-[220px] items-center justify-center rounded-2xl border border-dashed border-border bg-muted/30">
    <div className="text-center text-sm text-muted-foreground">
      <p className="font-semibold text-foreground">Analytics coming soon</p>
      <p className="mt-1">Charts will appear once campaigns start running.</p>
    </div>
  </div>
);

export default function PerformanceOverview({
  metrics,
  state,
}: {
  metrics: Metric[];
  state: ModuleState;
}) {
  if (state === "loading") {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-[88px] rounded-2xl border border-border bg-muted/40" />
          ))}
        </div>
        {renderChartPlaceholder()}
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="rounded-2xl border border-dashed border-destructive/40 bg-destructive/10 p-6 text-sm text-destructive">
        Analytics service is unavailable. Try again later.
      </div>
    );
  }

  if (state === "empty") {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 opacity-70">
          {metrics.map((metric) => (
            <div key={metric.id} className="rounded-2xl border border-border bg-background p-4">
              <p className="text-[12px] uppercase tracking-[0.2em] text-muted-foreground">
                {metric.label}
              </p>
              <div className="mt-2 flex items-end justify-between">
                <span className="text-[20px] font-semibold text-foreground">{metric.value}</span>
              </div>
            </div>
          ))}
        </div>
        {renderChartPlaceholder()}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.id} className="rounded-2xl border border-border bg-background p-4">
            <p className="text-[12px] uppercase tracking-[0.2em] text-muted-foreground">
              {metric.label}
            </p>
            <div className="mt-2 flex items-end justify-between">
              <span className="text-[20px] font-semibold text-foreground">{metric.value}</span>
              {metric.change ? (
                <span
                  className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                    metric.trend === "down"
                      ? "bg-rose-100/80 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200"
                      : "bg-emerald-100/80 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200"
                  }`}
                >
                  {metric.change}
                </span>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-2xl border border-border bg-background p-4">
          <p className="text-[12px] uppercase tracking-[0.2em] text-muted-foreground">Reach by day</p>
          <div className="mt-3 h-[180px] rounded-xl bg-gradient-to-b from-[#907AFF]/20 via-transparent to-transparent" />
        </div>
        <div className="rounded-2xl border border-border bg-background p-4">
          <p className="text-[12px] uppercase tracking-[0.2em] text-muted-foreground">Top channels</p>
          <div className="mt-3 space-y-2 text-sm text-muted-foreground">
            <div className="flex items-center justify-between">
              <span>Email</span>
              <span>48%</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Substack</span>
              <span>32%</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Instagram</span>
              <span>20%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
