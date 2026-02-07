"use client";

import { forwardRef, useId, type SelectHTMLAttributes, type ReactNode } from "react";

/* ─────────────────────────────────────────────────────────────────────────────
 * Types
 * ───────────────────────────────────────────────────────────────────────────── */

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  /** Label displayed above the select */
  label?: string;
  /** Error message displayed below the select */
  error?: string;
  /** Hint text displayed below the select (hidden when error is shown) */
  hint?: string;
  /** Options for the select */
  options: SelectOption[];
  /** Placeholder option (first disabled option) */
  placeholder?: string;
  /** Size variant */
  selectSize?: "sm" | "md" | "lg";
  /** Full width */
  fullWidth?: boolean;
  /** Icon to display at the start */
  startIcon?: ReactNode;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Size Styles
 * ───────────────────────────────────────────────────────────────────────────── */

const sizeStyles = {
  sm: "px-2.5 py-1.5 text-xs pr-8",
  md: "px-3 py-2 text-sm pr-10",
  lg: "px-4 py-3 text-base pr-12",
};

const iconSizeStyles = {
  sm: "right-2",
  md: "right-3",
  lg: "right-4",
};

/* ─────────────────────────────────────────────────────────────────────────────
 * Chevron Icon
 * ───────────────────────────────────────────────────────────────────────────── */

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
        clipRule="evenodd"
      />
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Select Component
 * ───────────────────────────────────────────────────────────────────────────── */

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      label,
      error,
      hint,
      options,
      placeholder,
      selectSize = "md",
      fullWidth = false,
      startIcon,
      className = "",
      id,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const selectId = id || props.name || generatedId;
    const hasError = !!error;

    return (
      <div className={`flex flex-col gap-1 ${fullWidth ? "w-full" : ""}`}>
        {label && (
          <label
            htmlFor={selectId}
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
          <select
            ref={ref}
            id={selectId}
            aria-invalid={hasError}
            aria-describedby={hasError ? `${selectId}-error` : hint ? `${selectId}-hint` : undefined}
            className={`
              appearance-none rounded-lg border bg-white text-slate-900
              focus:outline-none focus:ring-2 focus:ring-verkli-primary/40
              disabled:cursor-not-allowed disabled:opacity-50
              dark:border-white/20 dark:bg-white/10 dark:text-white
              ${hasError
                ? "border-red-300 focus:border-red-500 focus:ring-red-500/40 dark:border-red-700"
                : "border-slate-300 focus:border-slate-500 dark:focus:border-white/40"
              }
              ${startIcon ? "pl-10" : ""}
              ${sizeStyles[selectSize]}
              ${fullWidth ? "w-full" : ""}
              ${className}
            `}
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((option) => (
              <option
                key={option.value}
                value={option.value}
                disabled={option.disabled}
              >
                {option.label}
              </option>
            ))}
          </select>
          <div
            className={`pointer-events-none absolute inset-y-0 flex items-center text-slate-400 dark:text-white/40 ${iconSizeStyles[selectSize]}`}
          >
            <ChevronDownIcon className="h-4 w-4" />
          </div>
        </div>
        {hasError && (
          <p
            id={`${selectId}-error`}
            role="alert"
            className="text-xs text-red-600 dark:text-red-400"
          >
            {error}
          </p>
        )}
        {hint && !hasError && (
          <p
            id={`${selectId}-hint`}
            className="text-xs text-slate-500 dark:text-white/50"
          >
            {hint}
          </p>
        )}
      </div>
    );
  }
);

Select.displayName = "Select";
