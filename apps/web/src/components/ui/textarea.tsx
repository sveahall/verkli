import * as React from "react";
import { cn } from "@/lib/utils";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  invalid?: boolean;
};

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, invalid, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          "input-base min-h-[120px] resize-y",
          // `input-base` is a globals.css @layer utilities class, so tailwind-merge
          // cannot dedupe it against these colour utilities — both land on the element
          // and `.input-base` wins on source order. The important modifier is what
          // makes the invalid state actually visible.
          invalid &&
            "border-red-500/70! text-red-700! placeholder:text-red-400! focus:border-red-500! focus:ring-red-500/30! dark:border-red-400/50! dark:text-red-200!",
          className
        )}
        {...props}
      />
    );
  }
);

Textarea.displayName = "Textarea";

export { Textarea };
