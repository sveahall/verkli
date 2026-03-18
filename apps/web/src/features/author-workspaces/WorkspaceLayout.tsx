import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type WorkspaceLayoutProps = {
  header: ReactNode;
  main: ReactNode;
  aside?: ReactNode;
  className?: string;
  mainClassName?: string;
  asideClassName?: string;
};

export default function WorkspaceLayout({
  header,
  main,
  className,
  mainClassName,
}: WorkspaceLayoutProps) {
  return (
    <div className={cn("page-content pb-10 pt-8 sm:pt-10", className)}>
      <div className="space-y-8">
        {header}
        <div className={cn("min-w-0", mainClassName)}>{main}</div>
      </div>
    </div>
  );
}
