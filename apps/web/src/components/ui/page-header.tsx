import * as React from "react";
import { cn } from "@/lib/utils";

export type PageHeaderProps = {
  eyebrow?: string;
  title: React.ReactNode;
  description?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
};

export function PageHeader({ eyebrow, title, description, subtitle, actions, className }: PageHeaderProps) {
  return (
    <header className={cn("flex flex-col gap-4 md:flex-row md:items-end md:justify-between", className)}>
      <div className="space-y-2">
        {eyebrow && <span className="text-eyebrow">{eyebrow}</span>}
        <h1 className="text-page-title">{title}</h1>
        {(description ?? subtitle) && <p className="max-w-2xl text-body">{description ?? subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </header>
  );
}
