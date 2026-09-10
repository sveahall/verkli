import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Status badge / pill. Semantic variants resolve through the OKLCH status
 * tokens defined in globals.css (`--color-{success,warning,info,error}` and
 * their `-muted` backgrounds), so they flip automatically in dark mode.
 *
 * Per DESIGN.md rule #6, state must never be encoded by colour alone — the
 * badge always renders a text label, and `dot` (default on for semantic
 * variants) adds a leading indicator. Pass `icon` to override the dot.
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-medium leading-5 tabular-nums whitespace-nowrap",
  {
    variants: {
      variant: {
        neutral:
          "bg-muted text-muted-foreground",
        success:
          "bg-[var(--color-success-muted)] text-[var(--color-success)]",
        warning:
          "bg-[var(--color-warning-muted)] text-[var(--color-warning)]",
        info: "bg-[var(--color-info-muted)] text-[var(--color-info)]",
        error: "bg-[var(--color-error-muted)] text-[var(--color-error)]",
        brand:
          "bg-accent text-accent-foreground",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  }
);

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants> & {
    /** Show a leading status dot. Defaults to true for semantic variants. */
    dot?: boolean;
    /** Custom leading icon, replaces the dot when provided. */
    icon?: React.ReactNode;
  };

export function Badge({
  className,
  variant,
  dot,
  icon,
  children,
  ...props
}: BadgeProps) {
  const showDot = dot ?? (variant != null && variant !== "neutral");

  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {icon ? (
        <span className="inline-flex h-3.5 w-3.5 items-center justify-center" aria-hidden>
          {icon}
        </span>
      ) : (
        showDot && (
          <span
            className="h-1.5 w-1.5 rounded-full bg-current"
            aria-hidden
          />
        )
      )}
      {children}
    </span>
  );
}

Badge.displayName = "Badge";

export { badgeVariants };
