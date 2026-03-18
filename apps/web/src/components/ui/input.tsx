"use client";

import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
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
    void fullWidth;
    const generatedId = useId();
    const inputId = id || props.name || generatedId;
    const hasError = !!error;
    const isPassword = props.type === "password";
    const [showPassword, setShowPassword] = useState(false);

    const resolvedType = isPassword && showPassword ? "text" : props.type;

    const passwordToggle = isPassword ? (
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShowPassword((v) => !v)}
        aria-label={showPassword ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 transition-colors hover:text-slate-600 dark:text-white/40 dark:hover:text-white/60"
      >
        {showPassword ? (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
          </svg>
        ) : (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        )}
      </button>
    ) : null;

    const hasEndAdornment = endIcon || isPassword;

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
              hasEndAdornment && "pr-10",
              sizeStyles[inputSize],
              className,
            )}
            {...props}
            type={resolvedType}
          />
          {isPassword ? passwordToggle : endIcon ? (
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 dark:text-white/40">
              {endIcon}
            </div>
          ) : null}
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
