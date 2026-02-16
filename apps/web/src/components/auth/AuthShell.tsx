import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
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
    <main className="relative grid min-h-screen min-h-svh place-items-center overflow-hidden bg-[#f5f5f7] text-foreground dark:bg-[#0a0a0f]">
      {/* ── Animated gradient orbs ── */}
      <div className="pointer-events-none absolute inset-0">
        {/* Primary orb — purple */}
        <div
          className="absolute -left-[10%] -top-[20%] h-[80vh] w-[80vw] animate-[auth-drift1_12s_ease-in-out_infinite_alternate] rounded-full opacity-40 blur-[100px] dark:opacity-100"
          style={{
            background:
              "radial-gradient(circle, rgba(139,92,246,0.55), rgba(99,60,220,0.2) 50%, transparent 70%)",
          }}
        />
        {/* Secondary orb — blue */}
        <div
          className="absolute -bottom-[15%] -right-[5%] h-[70vh] w-[70vw] animate-[auth-drift2_14s_ease-in-out_infinite_alternate] rounded-full opacity-30 blur-[100px] dark:opacity-100"
          style={{
            background:
              "radial-gradient(circle, rgba(56,152,255,0.5), rgba(30,100,220,0.15) 50%, transparent 70%)",
          }}
        />
        {/* Tertiary orb — pink */}
        <div
          className="absolute left-[30%] top-[55%] h-[50vh] w-[50vw] animate-[auth-drift3_16s_ease-in-out_infinite_alternate] rounded-full opacity-25 blur-[100px] dark:opacity-100"
          style={{
            background:
              "radial-gradient(circle, rgba(236,72,153,0.35), rgba(200,50,180,0.1) 50%, transparent 70%)",
          }}
        />
        {/* Amber accent */}
        <div
          className="absolute left-[55%] top-[20%] h-[30vh] w-[30vw] animate-[auth-drift1_10s_ease-in-out_infinite_alternate-reverse] rounded-full opacity-30 blur-[80px] dark:opacity-100"
          style={{
            background:
              "radial-gradient(circle, rgba(251,191,36,0.2), transparent 60%)",
          }}
        />
      </div>

      <header className="absolute left-6 top-6 z-30 flex items-center gap-3 sm:left-10 sm:top-8">
        <Link href="/" className="flex items-center">
          <Image src="/logo-dark.svg" alt="Verkli" width={122} height={28} className="h-7 w-auto dark:hidden" />
          <Image src="/favicon.svg" alt="Verkli" width={28} height={28} className="hidden h-7 w-auto dark:block" />
        </Link>
        <Link
          href={backHref}
          className="flex items-center gap-1.5 rounded-full border border-black/[0.06] bg-white/70 px-3.5 py-2 text-[13px] font-medium text-slate-600 shadow-sm backdrop-blur-md transition hover:border-black/10 hover:bg-white/90 hover:text-slate-900 dark:border-white/[0.08] dark:bg-white/[0.06] dark:text-white/60 dark:shadow-none dark:hover:border-white/15 dark:hover:bg-white/10 dark:hover:text-white"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 6l-6 6 6 6" />
          </svg>
          {backLabel}
        </Link>
      </header>

      <div className="absolute bottom-6 right-6 z-30 sm:bottom-8 sm:right-10">
        <ThemeToggle useGlass={false} />
      </div>

      <div className="relative z-20 mx-auto flex w-full max-w-[440px] flex-col items-center px-5 sm:px-0">
        {children}
      </div>
    </main>
  );
}
