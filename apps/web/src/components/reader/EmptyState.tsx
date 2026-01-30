import type { ReactNode } from "react";

type EmptyStateProps = {
  title: string;
  description: string;
  action?: ReactNode;
};

export default function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="empty-state-base">
      <p className="text-[15px] font-semibold text-slate-900 dark:text-white">{title}</p>
      <p className="mt-2 text-helper">{description}</p>
      {action && <div className="mt-5 flex items-center gap-3">{action}</div>}
    </div>
  );
}
