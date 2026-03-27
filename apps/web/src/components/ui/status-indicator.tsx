import { cn } from "@/lib/utils";

type StatusIndicatorVariant = "saving" | "saved" | "unsaved" | "error" | "idle" | "loading";

const config: Record<
  StatusIndicatorVariant,
  { dot: string; text: string; label: string; animate?: boolean }
> = {
  saving: {
    dot: "bg-[#907AFF] dark:bg-[#b8a9ff]",
    text: "text-[#907AFF] dark:text-[#b8a9ff]",
    label: "Saving...",
    animate: true,
  },
  saved: {
    dot: "bg-emerald-500 dark:bg-emerald-400",
    text: "text-emerald-600 dark:text-emerald-400",
    label: "Saved",
  },
  unsaved: {
    dot: "bg-amber-500 dark:bg-amber-400",
    text: "text-amber-600 dark:text-amber-400",
    label: "Unsaved changes",
  },
  error: {
    dot: "bg-red-500 dark:bg-red-400",
    text: "text-red-600 dark:text-red-400",
    label: "Error saving",
  },
  idle: {
    dot: "bg-slate-300 dark:bg-white/30",
    text: "text-slate-400 dark:text-white/40",
    label: "Autosave active",
  },
  loading: {
    dot: "bg-slate-400 dark:bg-white/40",
    text: "text-slate-500 dark:text-white/50",
    label: "Loading...",
    animate: true,
  },
};

export type StatusIndicatorProps = {
  status: StatusIndicatorVariant;
  /** Override the default label text */
  label?: string;
  className?: string;
};

export function StatusIndicator({
  status,
  label: labelOverride,
  className,
}: StatusIndicatorProps) {
  const { dot, text, label, animate } = config[status];

  return (
    <span
      className={cn("inline-flex items-center gap-1.5 text-[12px]", text, className)}
      role="status"
      aria-live="polite"
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          dot,
          animate && "animate-pulse"
        )}
      />
      {labelOverride ?? label}
    </span>
  );
}
