import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/utils";

type WorkspaceLayoutProps = {
  header: ReactNode;
  headerRight?: ReactNode;
  main: ReactNode;
  className?: string;
  mainClassName?: string;
  /**
   * Right-docked companion surface — the AI assistant today. Rendered beside
   * `main` from lg up, using the right column width the design system already
   * defines for the workspace grid (360–400px). Below lg there is no room to
   * sit beside anything, so it becomes a slide-over sheet.
   */
  aside?: ReactNode;
  asideOpen?: boolean;
  onAsideClose?: () => void;
  /** Accessible name for the slide-over dialog. */
  asideLabel?: string;
};

type SurfaceProps = ComponentPropsWithoutRef<"div">;

type WorkspaceContextCardProps = SurfaceProps & {
  eyebrow?: string;
  title?: ReactNode;
  description?: ReactNode;
};

type WorkspaceMetricProps = {
  label: string;
  value: ReactNode;
  className?: string;
};

export function WorkspaceSurface({
  className,
  ...props
}: SurfaceProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-200/80 bg-white dark:border-white/10 dark:bg-white/[0.04]",
        className
      )}
      {...props}
    />
  );
}

export function WorkspaceRightContextPanel({
  className,
  ...props
}: SurfaceProps) {
  return <div className={cn("space-y-4", className)} {...props} />;
}

export function WorkspaceContextCard({
  eyebrow,
  title,
  description,
  className,
  children,
  ...props
}: WorkspaceContextCardProps) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-white/10 dark:bg-white/[0.04]",
        className
      )}
      {...props}
    >
      {(eyebrow || title || description) ? (
        <div className="space-y-1.5">
          {eyebrow ? <p className="text-eyebrow">{eyebrow}</p> : null}
          {title ? (
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              {title}
            </h2>
          ) : null}
          {description ? (
            <p className="text-[13px] leading-relaxed text-slate-500 dark:text-white/45">
              {description}
            </p>
          ) : null}
        </div>
      ) : null}
      {children ? (
        <div className={cn(eyebrow || title || description ? "mt-3" : undefined)}>
          {children}
        </div>
      ) : null}
    </section>
  );
}

export function WorkspaceMetric({
  label,
  value,
  className,
}: WorkspaceMetricProps) {
  return (
    <div className={cn("space-y-0", className)}>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-white/35">
        {label}
      </dt>
      <dd className="text-sm text-slate-900 dark:text-white">{value}</dd>
    </div>
  );
}

export default function WorkspaceLayout({
  header,
  headerRight,
  main,
  className,
  mainClassName,
  aside,
  asideOpen = false,
  onAsideClose,
  asideLabel = "Assistant",
}: WorkspaceLayoutProps) {
  const docked = Boolean(aside) && asideOpen;

  return (
    <div className={cn("w-full", className)}>
      <div className="bg-white dark:bg-transparent">
        <div className="mx-auto flex max-w-[1520px] items-center justify-between px-4 pb-4 pt-6 sm:px-6 sm:pb-5 sm:pt-5 lg:px-8 lg:pt-10 xl:px-10">
          <div className="min-w-0">{header}</div>
          {headerRight ? <div className="shrink-0">{headerRight}</div> : null}
        </div>
        <div className="h-px bg-slate-200/80 dark:bg-white/10" />
      </div>

      <div
        className={cn(
          "mx-auto max-w-[1520px] px-4 pb-10 pt-6 sm:px-6 lg:px-8 xl:px-10",
          docked &&
            "lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(360px,400px)] lg:items-start lg:gap-6 xl:gap-8"
        )}
      >
        {/* min-w-0 so a wide child (a table, a code block) shrinks the column
            instead of pushing the dock off-screen. */}
        <div className={cn(docked && "min-w-0", mainClassName)}>{main}</div>

        {/* ONE node, not two. A desktop copy plus a mobile copy would mount the
            assistant twice — two React trees, two transcripts — and the
            conversation would appear to vanish whenever the viewport crossed
            the breakpoint. So this element is a fixed sheet on small screens
            and a sticky column from lg up.

            Height, not max-height, on the lg side: the dock is a flex column
            that fills its container, and max-h alone leaves the card collapsed
            to its content — a short chat floating in a tall empty column. */}
        {docked ? (
          <aside
            aria-label={asideLabel}
            className={cn(
              // The bottom padding carries the safe area inside its own calc.
              // Using the .safe-area-inset-bottom utility instead would set
              // padding-bottom on its own and, as a custom utility, silently
              // beat pb-* — leaving the composer under the mobile tab bar.
              "fixed inset-y-0 right-0 z-50 flex w-full max-w-[420px] flex-col bg-white px-4 pt-4 pb-[calc(6rem+env(safe-area-inset-bottom,0px))] shadow-surface-lg dark:bg-[#111318]",
              // From lg the tab bar is gone; the clearance is for the floating
              // theme toggle in the bottom-right corner.
              "lg:sticky lg:inset-auto lg:top-6 lg:z-auto lg:h-[calc(100vh-7rem)] lg:max-w-none lg:bg-transparent lg:px-0 lg:pt-0 lg:pb-14 lg:shadow-none lg:dark:bg-transparent"
            )}
          >
            {aside}
          </aside>
        ) : null}
      </div>

      {/* Backdrop for the sheet only. Below lg the dock covers the canvas, so
          tapping outside it should close rather than silently do nothing. */}
      {docked ? (
        <button
          type="button"
          aria-label={`Close ${asideLabel.toLowerCase()}`}
          onClick={onAsideClose}
          className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-[2px] lg:hidden dark:bg-black/50"
        />
      ) : null}
    </div>
  );
}
