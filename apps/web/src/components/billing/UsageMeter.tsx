import { useId } from "react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export type UsageMeterState =
  | { mode: "beta" }
  | {
      mode: "metered";
      used: number;
      limit: number;
      periodLabel?: string;
      resetLabel?: string;
      /** Supply only when a real top-up flow is available. */
      topUpHref?: `/${string}`;
    };

/** Presentation only: beta metering, enforcement and payments remain independent. */
export function UsageMeter({ state }: { state: UsageMeterState }) {
  const id = useId();
  const isBeta = state.mode === "beta";
  const remaining = state.mode === "metered" &&
    Number.isFinite(state.used) && state.used >= 0 &&
    Number.isFinite(state.limit) && state.limit > 0
    ? Math.max(0, state.limit - state.used) / state.limit * 100
    : null;
  const isLow = remaining !== null && remaining > 0 && remaining <= 10;
  const isEmpty = remaining === 0;
  const status = isBeta
    ? "Unlimited during beta"
    : remaining === null
      ? "Usage unavailable"
      : remaining > 0 && remaining < 1
        ? "<1% left"
        : `${Math.round(remaining)}% left`;
  const topUpHref = state.mode === "metered" ? state.topUpHref : undefined;

  return (
    <section aria-labelledby={`${id}-title`} className="rounded-2xl border border-border bg-card px-5 py-6 sm:px-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={`${id}-title`} className="author-section-title text-section-title">Usage</h2>
        {isBeta && <span className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">Beta access</span>}
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {isBeta
          ? "Beta usage helps us understand how to set future limits and pricing."
          : "Keep track of your available allowance."}
      </p>

      <div className="mt-5 rounded-2xl border border-border bg-muted/40 px-4 py-4 sm:px-5">
        <h3 className="text-sm font-medium text-foreground">
          {state.mode === "metered" ? state.periodLabel ?? "Usage allowance" : "Your allowance"}
        </h3>
        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
          <p className="text-muted-foreground">
            {isBeta ? "No usage cap" : state.resetLabel ?? "Available balance"}
          </p>
          <p className="font-medium tabular-nums text-foreground">{status}</p>
        </div>
        <div
          role={remaining !== null ? "progressbar" : undefined}
          aria-label={remaining !== null ? "Usage remaining" : undefined}
          aria-valuemin={remaining !== null ? 0 : undefined}
          aria-valuemax={remaining !== null ? 100 : undefined}
          aria-valuenow={remaining ?? undefined}
          aria-valuetext={remaining !== null ? status : undefined}
          aria-hidden={remaining === null ? true : undefined}
          className="mt-3 h-2 overflow-hidden rounded-full bg-foreground/10"
        >
          <div
            className={`h-full rounded-full ${isLow ? "bg-amber-600 dark:bg-amber-400" : "bg-foreground"}`}
            style={{ width: `${isBeta ? 100 : remaining ?? 0}%` }}
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm leading-relaxed text-muted-foreground">
          {isBeta
            ? "No top-up needed during beta. Limits and prices have not been set yet."
            : remaining === null
              ? "We could not show your allowance. Please try again later."
              : isEmpty
                ? `Allowance used up. ${topUpHref ? "Top up to continue." : "Top-ups are not available yet."}`
                : isLow
                  ? "Your allowance is running low."
                  : "Your remaining allowance is shown above."}
        </p>
        {!isBeta && remaining !== null && topUpHref && (
          <Link href={topUpHref} className={buttonVariants({ variant: isEmpty ? "primary" : "secondary", size: "sm" })}>
            Top up
          </Link>
        )}
      </div>
    </section>
  );
}
