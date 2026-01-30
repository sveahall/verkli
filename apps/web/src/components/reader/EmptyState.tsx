import type { ReactNode } from "react";

type EmptyStateProps = {
  title: string;
  description: string;
  action?: ReactNode;
};

export default function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200/80 bg-white/70 px-6 py-5 text-left dark:border-white/15 dark:bg-white/5">
      <p className="text-[14px] font-semibold text-slate-900 dark:text-white">{title}</p>
      <p className="mt-1 text-[13px] text-slate-500 dark:text-white/60">{description}</p>
      {action && <div className="mt-4 flex items-center gap-3">{action}</div>}
    </div>
  );
}
