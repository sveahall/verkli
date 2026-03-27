import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default:
          "border border-slate-200 bg-slate-100 text-slate-700 dark:border-white/10 dark:bg-white/10 dark:text-white/70",
        brand:
          "border border-[#907AFF]/30 bg-[#907AFF]/10 text-[#5c4bb8] dark:border-[#907AFF]/40 dark:bg-[#907AFF]/20 dark:text-[#b8a9ff]",
        success:
          "border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300",
        warning:
          "border border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300",
        error:
          "border border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-300",
        info:
          "border border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-300",
        outline:
          "border border-black/[0.08] bg-transparent text-slate-600 dark:border-white/[0.1] dark:text-white/60",
      },
      size: {
        sm: "px-2 py-0.5 text-[10px]",
        md: "px-2.5 py-1 text-xs",
        lg: "px-3 py-1.5 text-[13px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  }
);

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants> & {
    /** Optional dot indicator before label */
    dot?: boolean;
  };

export function Badge({
  className,
  variant,
  size,
  dot,
  children,
  ...props
}: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant, size }), className)} {...props}>
      {dot && (
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            variant === "success" && "bg-emerald-500",
            variant === "warning" && "bg-amber-500",
            variant === "error" && "bg-red-500",
            variant === "info" && "bg-blue-500",
            variant === "brand" && "bg-[#907AFF]",
            (!variant || variant === "default" || variant === "outline") &&
              "bg-slate-400 dark:bg-white/40"
          )}
        />
      )}
      {children}
    </span>
  );
}
