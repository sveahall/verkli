import type { ReactNode } from "react";

import EmptyState from "@/components/reader/EmptyState";

type RailProps = {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  isEmpty?: boolean;
  emptyState?: ReactNode;
};

export default function Rail({ title, subtitle, action, children, isEmpty, emptyState }: RailProps) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[20px] font-semibold text-slate-900 dark:text-white">
            {title}
          </h2>
          {subtitle && (
            <p className="text-[13px] text-slate-500 dark:text-white/50">
              {subtitle}
            </p>
          )}
        </div>
        {action && <div className="flex items-center gap-2">{action}</div>}
      </div>

      <div className="flex gap-4 overflow-x-auto pb-2 pr-2">
        {children}
      </div>

      {isEmpty && (
        <div className="pt-1">
          {emptyState ?? (
            <EmptyState
              title="Nothing here yet"
              description="Save a few books to start curating your rail."
            />
          )}
        </div>
      )}
    </section>
  );
}
