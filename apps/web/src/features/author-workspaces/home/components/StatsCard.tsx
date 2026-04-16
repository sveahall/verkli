import { type ReactNode, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type StatsCardProps = {
  icon: ReactNode;
  label: string;
  growth?: string;
  value: string;
  toneClassName?: string;
  href?: string;
  description?: string;
};

export default function StatsCard({
  icon,
  label,
  growth,
  value,
  toneClassName,
  href,
  description,
}: StatsCardProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(null);

  const handleMouseEnter = () => {
    if (!description) return;
    timeoutRef.current = setTimeout(() => setShowTooltip(true), 400);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setShowTooltip(false);
  };

  const content = (
    <article
      className={cn(
        "relative min-h-[118px] rounded-2xl bg-white px-4 py-3.5 shadow-[0_2px_10px_rgba(15,23,42,0.04)] dark:bg-white/[0.04]",
        href && "cursor-pointer transition-all duration-200 hover:shadow-md hover:shadow-black/[0.06] hover:-translate-y-0.5 active:scale-[0.98] dark:hover:bg-white/[0.06]"
      )}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div
        className={cn(
          "mb-4 flex h-10 w-10 items-center justify-center rounded-full",
          toneClassName
        )}
      >
        {icon}
      </div>
      <div className="space-y-1.5 pb-1">
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
        <p className="text-3xl font-normal leading-tight tracking-[-0.01em] text-slate-900 dark:text-white">{value}</p>
      </div>

      {description && showTooltip ? (
        <div className="absolute left-1/2 top-0 z-50 w-56 -translate-x-1/2 -translate-y-[calc(100%+8px)] rounded-xl border border-slate-200/80 bg-white px-3.5 py-3 shadow-lg shadow-black/[0.08] dark:border-white/10 dark:bg-[#1a1f2e]">
          <p className="text-[13px] font-semibold text-slate-900 dark:text-white">
            {label}
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-slate-500 dark:text-white/50">
            {description}
          </p>
          <div className="absolute bottom-0 left-1/2 h-2 w-2 -translate-x-1/2 translate-y-1/2 rotate-45 border-b border-r border-slate-200/80 bg-white dark:border-white/10 dark:bg-[#1a1f2e]" />
        </div>
      ) : null}
    </article>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return content;
}
