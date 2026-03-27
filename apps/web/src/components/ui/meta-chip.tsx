import { cn } from "@/lib/utils";

export type MetaChipProps = React.HTMLAttributes<HTMLSpanElement> & {
  /** Optional leading icon */
  icon?: React.ReactNode;
};

/**
 * Small metadata indicator — use for chapter count, language, word count, etc.
 * Replaces the inline `rounded-full border border-black/[0.06] bg-white/80 px-3 py-1 text-[11px]`
 * pattern that appears 15+ times across the codebase.
 */
export function MetaChip({ icon, className, children, ...props }: MetaChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-black/[0.06] bg-white/80 px-3 py-1 text-[11px] font-medium text-slate-500 backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white/50",
        className
      )}
      {...props}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      {children}
    </span>
  );
}
