import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type AuthCardProps = {
  title: string;
  subtitle?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
};

export default function AuthCard({
  title,
  subtitle,
  description,
  children,
  footer,
  className,
}: AuthCardProps) {
  return (
    <div className={cn("card-auth w-full", className)}>
      <div className="flex w-full flex-col items-center px-8 pb-10 pt-12 text-center sm:px-12 sm:pb-12 sm:pt-14">
        {subtitle && (
          <p className="text-[15px] font-normal text-slate-500 dark:text-white/45">
            {subtitle}
          </p>
        )}
        <h1 className="mt-2 text-[28px] font-semibold leading-[1.2] tracking-[-0.02em] text-slate-900 dark:text-white sm:text-[32px]">
          {title}
        </h1>
        {description && (
          <p className="mt-2 text-[15px] leading-relaxed text-slate-500 dark:text-white/50">{description}</p>
        )}

        <div className="mt-8 w-full text-left">{children}</div>

        {footer && <div className="mt-6 w-full text-center">{footer}</div>}
      </div>
    </div>
  );
}
