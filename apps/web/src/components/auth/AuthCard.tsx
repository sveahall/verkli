import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
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
    <Card className={cn("card-auth w-full", className)}>
      <div className="flex w-full flex-col items-center px-6 py-10 text-center sm:px-10 sm:py-12">
        {subtitle && (
          <p className="text-sm font-medium tracking-wide text-slate-600 dark:text-white/50 sm:text-base">
            {subtitle}
          </p>
        )}
        <h1 className="mt-3 text-2xl font-semibold leading-[1.15] tracking-tight text-slate-900 dark:text-white sm:mt-4 sm:text-3xl md:text-[36px]">
          {title}
        </h1>
        {description && (
          <p className="mt-3 text-[14px] text-slate-600 dark:text-white/60">{description}</p>
        )}
        <div className="mt-8 w-full text-left">{children}</div>
        {footer && <div className="mt-6 w-full text-center">{footer}</div>}
      </div>
    </Card>
  );
}
