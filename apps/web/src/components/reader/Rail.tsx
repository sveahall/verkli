import type { ReactNode } from "react";

import EmptyState from "@/components/reader/EmptyState";

type RailProps = {
  title: string;
  subtitle?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  isEmpty?: boolean;
  emptyState?: ReactNode;
};

export default function Rail({ title, subtitle, description, action, children, isEmpty, emptyState }: RailProps) {
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-section-title">{title}</h2>
          {(subtitle ?? description) && <p className="text-helper">{subtitle ?? description}</p>}
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
              description="Add items and they'll show up here."
            />
          )}
        </div>
      )}
    </section>
  );
}
