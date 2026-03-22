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
    <article className="min-h-[118px] rounded-2xl bg-white px-4 py-3.5 dark:bg-white/[0.04]">
      <div
        className={cn(
          "mb-4 flex h-10 w-10 items-center justify-center rounded-full",
          toneClassName
        )}
      >
        {icon}
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#6D7386] dark:text-white/50">
            {label}
          </p>
          {growth ? (
            <span className="text-[11px] font-medium text-[#1FA971]">
              {growth}&thinsp;&#8599;
            </span>
          ) : null}
        </div>
        <p className="text-3xl font-semibold leading-none text-slate-900 dark:text-white">{value}</p>
      </div>
    </article>
  );
}
