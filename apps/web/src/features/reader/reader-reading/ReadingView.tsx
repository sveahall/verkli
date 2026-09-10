import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

type ReadingViewProps = {
  backHref: string;
  backLabel: string;
  bookTitle: string;
  chapterLabel?: string;
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
  progressLabel,
  chapterNavigator,
  chapterContent,
  audioPlayer,
  gate,
  footerNavigation,
  commentsSection,
}: ReadingViewProps) {
  return (
    <main className="min-h-screen bg-muted text-foreground dark:bg-background">
      <div className="mx-auto max-w-5xl px-4 pt-4 pb-8 sm:px-6">
        <div className="mx-auto max-w-[720px]">
          {/* Compact header: back + book title + progress */}
          <header className="mb-4 flex items-center gap-4">
            <Link
              href={backHref}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground dark:hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{backLabel}</span>
            </Link>
            <span className="min-w-0 flex-1 truncate text-center text-sm font-medium text-foreground">
              {bookTitle}
            </span>
            <span className="whitespace-nowrap text-xs text-muted-foreground">
              {progressLabel}
            </span>
          </header>

          {/* Chapter navigator — directly below header */}
          {chapterNavigator}

          {/* Content — seamless with navigator */}
          <div className="mt-4 space-y-6">
            {chapterContent}
            {audioPlayer}
            {gate}
            {footerNavigation}
          </div>

          {/* Comments */}
          <div className="mt-8">
            {commentsSection}
          </div>
        </div>
      </div>
    </main>
  );
}
