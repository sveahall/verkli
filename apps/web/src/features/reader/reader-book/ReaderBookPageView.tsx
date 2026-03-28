import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

type ReaderBookPageViewProps = {
  backHref: string;
  title: string;
  authorName: string;
  authorHref: string;
  cover: React.ReactNode;
  followAction?: React.ReactNode;
  metaChips: React.ReactNode;
  languageSwitcher?: React.ReactNode;
  description: string;
  notices?: React.ReactNode;
  actionBar: React.ReactNode;
  utilityBar?: React.ReactNode;
  editionNotes: Array<{ label: string; value: string }>;
  chaptersSection: React.ReactNode;
  podSection?: React.ReactNode;
  relatedSection?: React.ReactNode;
  reviewsSection: React.ReactNode;
  commentsSection: React.ReactNode;
};

export default function ReaderBookPageView({
  backHref, title, authorName, authorHref, cover, followAction, metaChips, languageSwitcher, description, notices, actionBar, utilityBar, editionNotes, chaptersSection, podSection, relatedSection, reviewsSection, commentsSection,
}: ReaderBookPageViewProps) {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <Link href={backHref} className="inline-flex items-center gap-2 text-[14px] font-medium text-slate-500 transition-colors hover:text-slate-900 dark:text-white/50 dark:hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Back to discover
        </Link>
      </header>

      {/* ── Main book card ── */}
      <Card className="relative overflow-hidden border-[#907AFF]/[0.06] bg-gradient-to-br from-[#907AFF]/[0.03] via-white to-white dark:from-[#907AFF]/[0.08] dark:via-[#050917] dark:to-[#050917]">
        <div className="pointer-events-none absolute -right-24 -top-24 h-[300px] w-[300px] rounded-full bg-[#907AFF]/[0.06] blur-[80px]" />
        <CardContent>
          <div className="relative grid gap-8 lg:grid-cols-[260px_minmax(0,1fr)] lg:items-start">
            <div className="relative mx-auto w-full max-w-[260px] lg:mx-0">
              <div className="absolute inset-4 rounded-[20px] bg-[#907AFF]/15 blur-2xl" />
              <div className="relative">{cover}</div>
            </div>
            <div className="space-y-5">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Link href={authorHref} className="text-[14px] font-semibold text-[#907AFF] transition hover:text-[#7058DD] dark:text-[#b8a8ff]">{authorName}</Link>
                  {followAction}
                </div>
                <h1 className="text-[32px] font-bold leading-[1.1] tracking-tight text-slate-950 dark:text-white sm:text-[40px]">{title}</h1>
                <p className="max-w-2xl text-[15px] leading-relaxed text-slate-500 dark:text-white/55">{description}</p>
                <div className="flex flex-wrap gap-2">{metaChips}</div>
                {languageSwitcher ? <div className="space-y-2">{languageSwitcher}</div> : null}
              </div>
              {notices ? <div className="space-y-3">{notices}</div> : null}
              <div className="flex flex-wrap items-center gap-3">{actionBar}</div>
              {utilityBar ? <div className="flex flex-wrap items-center gap-3">{utilityBar}</div> : null}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Edition notes ── */}
      <Card>
        <CardContent className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {editionNotes.map((item) => (
            <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 dark:border-white/10 dark:bg-white/5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-white/35">{item.label}</p>
              <p className="mt-2 text-[15px] font-semibold text-slate-900 dark:text-white">{item.value}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* ── About ── */}
      <Card>
        <CardContent>
          <p className="text-eyebrow text-[#907AFF]">Description</p>
          <h3 className="mt-1 text-[17px] font-semibold text-slate-900 dark:text-white">About this book</h3>
          <div className="mt-4 text-[15px] leading-relaxed text-slate-600 dark:text-white/65">
            <p>{description || "No description yet."}</p>
          </div>
        </CardContent>
      </Card>

      {/* ── Chapters ── */}
      <Card>
        <CardContent>
          <p className="text-eyebrow text-[#907AFF]">Chapters</p>
          <h3 className="mt-1 text-[17px] font-semibold text-slate-900 dark:text-white">Choose where to begin</h3>
          <div className="mt-4">{chaptersSection}</div>
        </CardContent>
      </Card>

      {podSection}
      {relatedSection}
      {reviewsSection}
      {commentsSection}
    </div>
  );
}
