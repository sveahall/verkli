import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "touch-target inline-flex items-center justify-center gap-2 rounded-full font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#907AFF]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60 dark:focus-visible:ring-offset-[#0b0b12]",
  {
    variants: {
      variant: {
        primary:
          "bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-white/90",
        secondary:
          "border border-slate-200/80 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-white/70 dark:hover:border-white/20 dark:hover:bg-white/10 dark:hover:text-white",
        ghost:
          "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-white/60 dark:hover:bg-white/10 dark:hover:text-white",
        destructive:
          "bg-red-600 text-white hover:bg-red-500 dark:bg-red-500 dark:hover:bg-red-400",
      },
      size: {
        sm: "min-h-[40px] px-4 py-2 text-[13px]",
        md: "min-h-[44px] px-5 py-3 text-[14px]",
        lg: "min-h-[48px] px-6 py-3 text-[15px]",
        icon: "h-11 w-11",
      },
      fullWidth: {
        true: "w-full",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    isLoading?: boolean;
    loadingText?: string;
  };

function Button({
  className,
  variant,
  size,
  fullWidth,
  isLoading,
  loadingText,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || isLoading;
  const label = isLoading && loadingText ? loadingText : children;

  return (
    <button
      className={cn(buttonVariants({ variant, size, fullWidth }), className)}
      disabled={isDisabled}
      aria-busy={isLoading || undefined}
      {...props}
    >
      {isLoading && (
        <span className="inline-flex items-center gap-2" aria-hidden>
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-white dark:border-slate-900/40 dark:border-t-slate-900" />
        </span>
      )}
      <span className={cn("inline-flex items-center gap-2", isLoading ? "opacity-90" : undefined)}>
        {label}
      </span>
    </button>
  );
}

Button.displayName = "Button";

export { Button, buttonVariants };
