"use client";

import Image from "next/image";

type Props = {
  coverImageUrl: string | null;
  onComplete: () => void;
  onOpenCover: () => void;
};

export default function CoverStep({ coverImageUrl, onComplete, onOpenCover }: Props) {
  const hasCover = Boolean(coverImageUrl);

  return (
    <div className="mx-auto max-w-xl space-y-6 py-6 text-center">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#907AFF]">Step 2</p>
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
          Add a cover
        </h2>
        <p className="mx-auto mt-2 max-w-md text-[14px] text-slate-500 dark:text-white/50">
          Upload a cover image or generate one with AI. A good cover increases reader engagement.
        </p>
      </div>

      {coverImageUrl ? (
        <div className="mx-auto h-48 w-32 overflow-hidden rounded-xl border border-black/10 dark:border-white/10">
          <Image
            src={coverImageUrl}
            alt="Book cover"
            width={128}
            height={192}
            className="h-full w-full object-cover"
          />
        </div>
      ) : (
        <div className="mx-auto flex h-48 w-32 items-center justify-center rounded-xl border-2 border-dashed border-slate-200 dark:border-white/10">
          <span className="text-xs text-slate-400 dark:text-white/30">No cover</span>
        </div>
      )}

      <div className="flex justify-center gap-3">
        <button
          type="button"
          onClick={onOpenCover}
          className="rounded-full border border-[#907AFF]/30 bg-[#907AFF]/10 px-6 py-2.5 text-sm font-semibold text-[#907AFF] transition hover:bg-[#907AFF]/20"
        >
          {hasCover ? "Change cover" : "Add cover"}
        </button>
        {hasCover && (
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
