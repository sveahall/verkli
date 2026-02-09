"use client";

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";

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
  /** Mark as invalid (maps to aria-invalid) */
  invalid?: boolean;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Size Styles
 * ───────────────────────────────────────────────────────────────────────────── */

const sizeStyles = {
  sm: "px-2.5 py-1.5 text-xs",
  md: "px-3 py-2 text-sm",
  lg: "px-4 py-3 text-base",
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
      invalid,
      className = "",
      id,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const inputId = id || props.name || generatedId;
    const hasError = !!error || !!invalid;

    return (
      <div className={`flex flex-col gap-1 ${fullWidth ? "w-full" : ""}`}>
        {label && (
          <label
            htmlFor={inputId}
            className="text-xs font-medium text-slate-500 dark:text-white/50"
          >
            {label}
          </label>
        )}
        <div className="relative">
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
            className={`
              rounded-lg border bg-white text-slate-900
              placeholder:text-slate-400
              focus:outline-none focus:ring-2 focus:ring-verkli-primary/40
              disabled:cursor-not-allowed disabled:opacity-50
              dark:border-white/20 dark:bg-white/10 dark:text-white dark:placeholder:text-white/40
              ${hasError
                ? "border-red-300 focus:border-red-500 focus:ring-red-500/40 dark:border-red-700"
                : "border-slate-300 focus:border-slate-500 dark:focus:border-white/40"
              }
              ${startIcon ? "pl-10" : ""}
              ${endIcon ? "pr-10" : ""}
              ${sizeStyles[inputSize]}
              ${fullWidth ? "w-full" : ""}
              ${className}
            `}
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
