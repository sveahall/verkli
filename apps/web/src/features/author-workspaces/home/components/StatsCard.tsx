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
        "relative min-h-[148px] rounded-2xl border border-border bg-card p-5",
        href && "cursor-pointer transition-[border-color,box-shadow] duration-150 hover:border-[#907AFF]/35 hover:shadow-[0_4px_18px_rgba(25,23,28,0.05)]"
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
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground dark:text-muted-foreground">
            {label}
          </p>
          {growth ? (
            <span className="text-[11px] font-medium text-[#1FA971]">
              {growth}&thinsp;&#8599;
            </span>
          ) : null}
        </div>
        <p className="text-3xl font-normal tabular-nums leading-tight tracking-[-0.01em] text-foreground dark:text-foreground">{value}</p>
      </div>

      {description && showTooltip ? (
        <div className="absolute left-1/2 top-0 z-50 w-56 -translate-x-1/2 -translate-y-[calc(100%+8px)] rounded-xl border border-border/80 bg-card px-3.5 py-3 shadow-lg shadow-black/[0.08] dark:border-border dark:bg-card">
          <p className="text-[13px] font-semibold text-foreground dark:text-foreground">
            {label}
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground dark:text-muted-foreground">
            {description}
          </p>
          <div className="absolute bottom-0 left-1/2 h-2 w-2 -translate-x-1/2 translate-y-1/2 rotate-45 border-b border-r border-border/80 bg-card dark:border-border dark:bg-card" />
        </div>
      ) : null}
    </article>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return content;
}
