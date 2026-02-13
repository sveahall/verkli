"use client";

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/* ─────────────────────────────────────────────────────────────────────────────
 * Types
 * ───────────────────────────────────────────────────────────────────────────── */

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Label displayed above the input */
  label?: string;
  /** Error message displayed below the input */
  error?: string;
  /** Hint text displayed below the input (hidden when error is shown) */
  hint?: string;
  /** Icon or element to display at the start of the input */
  startIcon?: ReactNode;
  /** Icon or element to display at the end of the input */
  endIcon?: ReactNode;
  /** Size variant */
  inputSize?: "sm" | "md" | "lg";
  /** Full width */
  fullWidth?: boolean;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Size Styles
 * ───────────────────────────────────────────────────────────────────────────── */

const sizeStyles = {
  sm: "h-9 px-3 text-[13px]",
  md: "h-11 px-3.5 text-[15px]",
  lg: "h-12 px-4 text-base",
};

/* ─────────────────────────────────────────────────────────────────────────────
 * Input Component
 * ───────────────────────────────────────────────────────────────────────────── */

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      hint,
      startIcon,
      endIcon,
      inputSize = "md",
      fullWidth = false,
      className = "",
      id,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const inputId = id || props.name || generatedId;
    const hasError = !!error;

    return (
      <div className="flex w-full flex-col gap-1">
        {label && (
          <label
            htmlFor={inputId}
            className="text-xs font-medium text-slate-500 dark:text-white/50"
          >
            {label}
          </label>
        )}
        <div className="relative w-full">
          {startIcon && (
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 dark:text-white/40">
              {startIcon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            aria-invalid={hasError}
            aria-describedby={hasError ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
            className={cn(
              "w-full rounded-xl border bg-white text-slate-900 transition-colors duration-150",
              "border-slate-200 placeholder:text-slate-400/70",
              "focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400",
              "disabled:cursor-not-allowed disabled:opacity-50",
              "dark:border-white/[0.1] dark:bg-white/[0.06] dark:text-white dark:placeholder:text-white/30",
              "dark:focus:ring-white/15 dark:focus:border-white/25",
              hasError
                ? "border-red-300 focus:border-red-500 focus:ring-red-500/20 dark:border-red-500/50 dark:focus:border-red-400"
                : "",
              startIcon && "pl-10",
              endIcon && "pr-10",
              sizeStyles[inputSize],
              className,
            )}
            {...props}
          />
          {endIcon && (
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 dark:text-white/40">
              {endIcon}
            </div>
          )}
        </div>
        {hasError && (
          <p
            id={`${inputId}-error`}
            role="alert"
            className="text-xs text-red-600 dark:text-red-400"
          >
            {error}
          </p>
        )}
        {hint && !hasError && (
          <p
            id={`${inputId}-hint`}
            className="text-xs text-slate-500 dark:text-white/50"
          >
            {hint}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";

/* ─────────────────────────────────────────────────────────────────────────────
 * Search Input Variant
 * ───────────────────────────────────────────────────────────────────────────── */

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function SearchInput(props: Omit<InputProps, "startIcon" | "type">) {
  return (
    <Input
      type="search"
      startIcon={<SearchIcon className="h-4 w-4" />}
      {...props}
    />
  );
}
