import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-full font-medium transition-[color,background-color,border-color,box-shadow,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.98] motion-reduce:transform-none disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "border border-transparent bg-primary text-primary-foreground shadow-surface-sm hover:bg-primary/90",
        secondary:
          "border border-border bg-card text-foreground hover:border-ring/50 hover:bg-accent/40",
        ghost:
          "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        destructive:
          "bg-red-600 text-white hover:bg-red-500 dark:bg-red-500 dark:hover:bg-red-400",
      },
      size: {
        sm: "min-h-[44px] px-4 py-2 text-[13px]",
        md: "min-h-[44px] px-5 py-3 text-[15px]",
        lg: "min-h-[48px] px-6 py-3 text-[15px]",
        icon: "h-11 w-11 rounded-full",
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
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current/25 border-t-current" />
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
