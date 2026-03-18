"use client";

type Props = {
  chapterCount: number;
  hasContent: boolean;
  onComplete: () => void;
  onOpenEditor: () => void;
};

export default function EditStep({ chapterCount, hasContent, onComplete, onOpenEditor }: Props) {
  const ready = chapterCount > 0 && hasContent;

  return (
    <div className="mx-auto max-w-xl space-y-6 py-6 text-center">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#907AFF]">Step 1</p>
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
          Write your manuscript
        </h2>
        <p className="mx-auto mt-2 max-w-md text-[14px] text-slate-500 dark:text-white/50">
          Write or import your manuscript. You need at least one chapter with content to continue.
        </p>
      </div>

      <div className="rounded-xl border border-slate-100 px-5 py-4 dark:border-white/[0.08]">
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-600 dark:text-white/60">Chapters</span>
          <span className={`text-sm font-medium ${chapterCount > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"}`}>
            {chapterCount}
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-sm text-slate-600 dark:text-white/60">Has content</span>
          <span className={`text-sm font-medium ${hasContent ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"}`}>
            {hasContent ? "Yes" : "Not yet"}
          </span>
        </div>
      </div>

      <div className="flex justify-center gap-3">
        <button
          type="button"
          onClick={onOpenEditor}
          className="rounded-full border border-[#907AFF]/30 bg-[#907AFF]/10 px-6 py-2.5 text-sm font-semibold text-[#907AFF] transition hover:bg-[#907AFF]/20"
        >
          Open editor
        </button>
        {ready && (
          <button
            type="button"
            onClick={onComplete}
            className="rounded-full bg-[#907AFF] px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#7c6ae6]"
          >
            Continue
          </button>
        )}
      </div>
    </div>
  );
}
