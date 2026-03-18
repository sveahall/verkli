"use client";

type Props = {
  onComplete: () => void;
  onSkip: () => void;
};

export default function PrintStep({ onComplete, onSkip }: Props) {
  return (
    <div className="mx-auto max-w-xl space-y-6 py-6 text-center">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#907AFF]">Step 5</p>
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
          Print on demand
        </h2>
        <p className="mx-auto mt-2 max-w-md text-[14px] text-slate-500 dark:text-white/50">
          Offer your book as a physical copy. Each book is printed when ordered — no inventory needed.
          You can configure formats and pricing after setup.
        </p>
      </div>

      <div className="flex justify-center gap-3">
        <button
          type="button"
          onClick={onSkip}
          className="rounded-full border border-slate-200 px-6 py-2.5 text-sm font-medium text-slate-500 transition hover:bg-slate-50 dark:border-white/10 dark:text-white/50 dark:hover:bg-white/5"
        >
          Skip for now
        </button>
        <button
          type="button"
          onClick={onComplete}
          className="rounded-full bg-[#907AFF] px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#7c6ae6]"
        >
          I want print copies
        </button>
      </div>
    </div>
  );
}
