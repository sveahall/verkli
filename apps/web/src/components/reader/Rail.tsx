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
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-section-title">{title}</h2>
          {subtitle && <p className="text-helper">{subtitle}</p>}
        </div>
        {action && <div className="flex items-center gap-2">{action}</div>}
      </div>

      <div className="flex gap-5 overflow-x-auto pb-2 pr-2 -mx-1">
        {children}
      </div>

      {isEmpty && (
        <div className="pt-2">
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
