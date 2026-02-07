import * as React from "react";
import { type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export type IconButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    "aria-label": string;
  };

function IconButton({ className, variant, size = "icon", children, ...props }: IconButtonProps) {
  return (
    <button className={cn(buttonVariants({ variant, size }), className)} {...props}>
      {children}
    </button>
  );
}

IconButton.displayName = "IconButton";

export { IconButton };
