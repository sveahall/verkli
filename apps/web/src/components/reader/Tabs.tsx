"use client";

import type { ReactNode } from "react";

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
};

export default function Tabs({ items, active, onChange, actions }: TabsProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-2">
        {items.map((item) => {
          const isActive = item.id === active;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChange(item.id)}
              className={`flex min-h-[40px] items-center gap-2 rounded-full px-4 py-2 text-[13px] font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#907AFF]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#0b0b12] ${
                isActive
                  ? "bg-slate-900 text-white shadow-md shadow-slate-900/10 dark:bg-white dark:text-slate-900"
                  : "border border-slate-200/80 bg-white/80 text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-white/70 dark:hover:text-white"
              }`}
            >
              <span>{item.label}</span>
              {item.badge && (
                <span className={`rounded-full px-2 py-0.5 text-[11px] ${
                  isActive
                    ? "bg-white/20 text-white"
                    : "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-white/60"
                }`}>
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
