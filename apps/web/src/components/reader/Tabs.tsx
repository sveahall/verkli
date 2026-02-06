"use client";

import type { ReactNode } from "react";
import { useId } from "react";

export type TabItem = {
  id: string;
  label: string;
  badge?: string;
};

type TabsProps = {
  items: TabItem[];
  active: string;
  onChange: (id: string) => void;
  actions?: ReactNode;
  /** Optional aria-label for the tablist */
  ariaLabel?: string;
};

export default function Tabs({ items, active, onChange, actions, ariaLabel = "Tabs" }: TabsProps) {
  const baseId = useId();

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div
        role="tablist"
        aria-label={ariaLabel}
        className="flex flex-wrap gap-2"
      >
        {items.map((item, index) => {
          const isActive = item.id === active;
          const tabId = `${baseId}-tab-${item.id}`;
          const panelId = `${baseId}-panel-${item.id}`;

          return (
            <button
              key={item.id}
              id={tabId}
              role="tab"
              type="button"
              tabIndex={isActive ? 0 : -1}
              aria-selected={isActive}
              aria-controls={panelId}
              onClick={() => onChange(item.id)}
              onKeyDown={(e) => {
                // Arrow key navigation for tabs
                if (e.key === "ArrowRight") {
                  e.preventDefault();
                  const nextIndex = (index + 1) % items.length;
                  onChange(items[nextIndex].id);
                } else if (e.key === "ArrowLeft") {
                  e.preventDefault();
                  const prevIndex = (index - 1 + items.length) % items.length;
                  onChange(items[prevIndex].id);
                } else if (e.key === "Home") {
                  e.preventDefault();
                  onChange(items[0].id);
                } else if (e.key === "End") {
                  e.preventDefault();
                  onChange(items[items.length - 1].id);
                }
              }}
              className={`flex min-h-[44px] items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-medium transition-all focus-ring ${
                isActive
                  ? "bg-verkli-primary text-white shadow-md shadow-verkli-primary/20"
                  : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 dark:border-white/15 dark:bg-white/5 dark:text-white/70 dark:hover:border-white/25 dark:hover:bg-white/10 dark:hover:text-white"
              }`}
            >
              <span>{item.label}</span>
              {item.badge && (
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    isActive
                      ? "bg-white/25 text-white"
                      : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-white/70"
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/**
 * TabPanel component for use with Tabs
 * Wrap your tab content in this component for proper accessibility
 */
export function TabPanel({
  id,
  tabId,
  active,
  children,
}: {
  id: string;
  tabId: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <div
      id={id}
      role="tabpanel"
      aria-labelledby={tabId}
      hidden={!active}
      tabIndex={0}
    >
      {active && children}
    </div>
  );
}
