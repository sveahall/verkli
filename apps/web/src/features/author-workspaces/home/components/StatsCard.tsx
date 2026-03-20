import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type StatsCardProps = {
  icon: ReactNode;
  label: string;
  growth?: string;
  value: string;
  toneClassName?: string;
};

export default function StatsCard({
  icon,
  label,
  growth,
  value,
  toneClassName,
}: StatsCardProps) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-6">
      <div
        className={cn(
          "mb-6 flex h-10 w-10 items-center justify-center rounded-full",
          toneClassName
        )}
      >
        {icon}
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {label}
          </p>
          {growth ? (
            <span className="text-xs font-medium text-green-600">
              {growth}&thinsp;&#8599;
            </span>
          ) : null}
        </div>
        <p className="text-3xl font-semibold text-slate-900">{value}</p>
      </div>
    </article>
  );
}
