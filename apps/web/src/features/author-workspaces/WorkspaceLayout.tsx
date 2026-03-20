import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/utils";

type WorkspaceLayoutProps = {
  header: ReactNode;
  headerRight?: ReactNode;
  main: ReactNode;
  className?: string;
  mainClassName?: string;
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
    <div className={cn("space-y-1", className)}>
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
}: WorkspaceLayoutProps) {
  return (
    <div className={cn("w-full", className)}>
      <div className="bg-white">
        <div className="mx-auto flex max-w-[1520px] items-center justify-between px-4 pb-5 pt-5 sm:px-6 sm:pt-8 lg:px-8 xl:px-10">
          <div className="min-w-0">{header}</div>
          {headerRight ? <div className="shrink-0">{headerRight}</div> : null}
        </div>
        <div className="h-px bg-gradient-to-r from-[#E8E1FC] via-[#DDD5F9] to-transparent" />
      </div>
      <div className={cn("mx-auto max-w-[1520px] px-4 pb-10 pt-6 sm:px-6 lg:px-8 xl:px-10", mainClassName)}>
        {main}
      </div>
    </div>
  );
}
