import type { ReactNode } from "react";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";

export type AuthShellProps = {
  children: ReactNode;
  backHref?: string;
  backLabel?: string;
};

export default function AuthShell({
  children,
  backHref = "/",
  backLabel = "Back to Verkli",
}: AuthShellProps) {
  return (
    <main
      className="relative flex min-h-screen min-h-svh flex-col justify-center overflow-hidden bg-background text-foreground"
      style={{ background: "var(--auth-background)" }}
    >
      <header className="absolute left-6 top-6 z-30 flex flex-wrap items-center gap-3 sm:left-8 sm:top-8">
        <Link href="/" className="flex items-center gap-3">
          <img src="/logo-dark.svg" alt="Verkli" className="h-8 w-auto dark:hidden" />
          <img src="/favicon.svg" alt="Verkli" className="hidden h-8 w-auto dark:block" />
        </Link>
        <Link href={backHref} className="btn-secondary text-[13px] gap-2 px-4 py-2.5">
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 6l-6 6 6 6" />
          </svg>
          {backLabel}
        </Link>
      </header>

      <div className="absolute bottom-8 right-8 z-30">
        <ThemeToggle useGlass={false} />
      </div>

      <div className="relative z-20 mx-auto flex w-full max-w-md flex-col items-center px-6 py-16 sm:px-8">
        {children}
      </div>
    </main>
  );
}
