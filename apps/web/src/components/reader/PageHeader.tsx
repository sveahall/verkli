import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  actions?: ReactNode;
};

export default function PageHeader({ title, subtitle, eyebrow, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="space-y-2">
        {eyebrow && (
          <span className="text-[12px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-white/50">
            {eyebrow}
          </span>
        )}
        <h1 className="text-[28px] font-semibold tracking-tight text-slate-900 dark:text-white sm:text-[32px]">
          {title}
        </h1>
        {subtitle && (
          <p className="max-w-2xl text-[15px] text-slate-600 dark:text-white/60">
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </header>
  );
}
