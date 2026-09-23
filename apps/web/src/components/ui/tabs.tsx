"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type TabItem = {
  id: string;
  label: string;
  badge?: string;
};

export type TabsProps = {
  items: TabItem[];
  active: string;
  onChange: (id: string) => void;
  actions?: React.ReactNode;
  className?: string;
};

export function Tabs({ items, active, onChange, actions, className }: TabsProps) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3", className)}>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Tabs">
        {items.map((item) => {
          const isActive = item.id === active;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(item.id)}
              className={cn(
                "flex min-h-[44px] items-center gap-2 rounded-full px-4 py-2 text-[13px] font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                isActive
                  ? "bg-primary text-primary-foreground shadow-md shadow-slate-900/10"
                  : "border border-border bg-card/80 text-muted-foreground hover:border-ring/50 hover:text-accent-foreground"
              )}
            >
              <span>{item.label}</span>
              {item.badge && (
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px]",
                    isActive
                      ? "bg-primary-foreground/15 text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  )}
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
