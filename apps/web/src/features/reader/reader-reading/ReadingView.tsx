import Link from "next/link";
import type { ReactNode } from "react";

type ReadingViewProps = {
  backHref: string;
  backLabel: string;
  bookTitle: string;
  chapterLabel: string;
  progressLabel: string;
  chapterNavigator: ReactNode;
  chapterContent: ReactNode;
  audioPlayer?: ReactNode;
  gate?: ReactNode;
  footerNavigation: ReactNode;
  commentsSection: ReactNode;
};

export default function ReadingView({
  backHref,
  backLabel,
  bookTitle,
  chapterLabel,
  progressLabel,
  chapterNavigator,
  chapterContent,
  audioPlayer,
  gate,
  footerNavigation,
  commentsSection,
}: ReadingViewProps) {
  return (
    <main className="min-h-screen bg-[#f7f8fb] text-foreground dark:bg-[#030712]">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[820px] space-y-6">
          <section className="overflow-hidden rounded-[32px] border border-black/[0.06] bg-[radial-gradient(circle_at_top_left,_rgba(144,122,255,0.16),_rgba(255,255,255,0.96)_38%,_rgba(250,250,252,0.98)_100%)] p-5 shadow-[0_26px_80px_-44px_rgba(15,23,42,0.28)] dark:border-white/10 dark:bg-[radial-gradient(circle_at_top_left,_rgba(144,122,255,0.16),_rgba(15,23,42,0.94)_42%,_rgba(2,6,23,0.98)_100%)] sm:p-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div className="space-y-1">
                <Link href={backHref} className="btn-ghost px-0">
                  <span aria-hidden>←</span> {backLabel}
                </Link>
                <div className="space-y-2">
                  <p className="text-eyebrow">Reading view</p>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-white/35">
                      {bookTitle}
                    </p>
                    <h1 className="text-[28px] font-semibold tracking-tight text-slate-950 dark:text-white sm:text-[34px]">
                      {chapterLabel}
                    </h1>
                  </div>
                  <p className="max-w-2xl text-[14px] leading-relaxed text-slate-600 dark:text-white/65">
                    Large margins, adjustable typography, and chapter controls stay close without turning the reading view into a dashboard.
                  </p>
                </div>
              </div>
              <div className="rounded-[24px] border border-black/[0.06] bg-white/78 px-4 py-3 shadow-[0_18px_44px_-36px_rgba(15,23,42,0.26)] dark:border-white/10 dark:bg-white/[0.05]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-white/35">
                  Progress
                </p>
                <p className="mt-2 text-[14px] font-semibold text-slate-900 dark:text-white">{progressLabel}</p>
                <p className="mt-1 text-[12px] text-slate-500 dark:text-white/50">
                  Theme and font controls live in the floating reader menu.
                </p>
              </div>
            </div>
          </section>

          <div className="space-y-5">
            {chapterNavigator}
            {chapterContent}
            {audioPlayer}
            {gate}
            {footerNavigation}
          </div>

          {commentsSection}
        </div>
      </div>
    </main>
  );
}
