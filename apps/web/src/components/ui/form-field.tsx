import * as React from "react";
import { cn } from "@/lib/utils";

export type FormFieldProps = {
  label: string;
  description?: string;
  helper?: string;
  error?: string;
  required?: boolean;
  optional?: boolean;
  id?: string;
  className?: string;
  children: React.ReactNode;
};

export function FormField({
  label,
  description,
  helper,
  error,
  required,
  optional,
  id,
  className,
  children,
}: FormFieldProps) {
  const generatedId = React.useId();
  const fieldId = id ?? `field-${generatedId}`;
  const descriptionId = description ? `${fieldId}-description` : undefined;
  const helperId = helper ? `${fieldId}-helper` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  const describedBy = [descriptionId, helperId, errorId].filter(Boolean).join(" ") || undefined;

  const child = React.isValidElement<Record<string, unknown>>(children)
    ? React.cloneElement(children, {
        id: fieldId,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
      })
    : children;

  return (
    <div className={cn("w-full space-y-1.5", className)}>
      <div className="flex items-center justify-between gap-4">
        <label htmlFor={fieldId} className="text-[13px] font-medium text-slate-600 dark:text-white/50">
          {label}
          {required && <span className="text-red-500"> *</span>}
        </label>
        {optional && <span className="text-helper">Optional</span>}
      </div>
      {description && (
        <p id={descriptionId} className="text-helper">
          {description}
        </p>
      )}
      {child}
      {helper && !error && (
        <p id={helperId} className="text-helper">
          {helper}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-[13px] text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
