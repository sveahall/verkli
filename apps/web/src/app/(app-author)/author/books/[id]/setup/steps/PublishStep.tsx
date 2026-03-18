"use client";

import { useState } from "react";

type Props = {
  bookTitle: string;
  isAlreadyPublished: boolean;
  onComplete: (choice: "publish" | "draft") => void;
  isSaving: boolean;
};

export default function PublishStep({ bookTitle, isAlreadyPublished, onComplete, isSaving }: Props) {
  const [choice, setChoice] = useState<"publish" | "draft">(
    isAlreadyPublished ? "publish" : "draft"
  );

  return (
    <div className="mx-auto max-w-xl space-y-6 py-6 text-center">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#907AFF]">Final step</p>
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
          Ready to share?
        </h2>
        <p className="mx-auto mt-2 max-w-md text-[14px] text-slate-500 dark:text-white/50">
          Choose whether to publish <strong>{bookTitle}</strong> now or keep it as a draft. You can always change this later.
        </p>
      </div>

      <div className="mx-auto grid max-w-sm grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setChoice("publish")}
          className={`rounded-xl border px-4 py-4 text-center transition ${
            choice === "publish"
              ? "border-emerald-500 ring-1 ring-emerald-500/30"
              : "border-slate-100 hover:border-slate-200 dark:border-white/[0.08] dark:hover:border-white/[0.15]"
          }`}
        >
          <p className="text-sm font-semibold text-slate-800 dark:text-white/90">Publish now</p>
          <p className="mt-1 text-xs text-slate-400 dark:text-white/40">Visible to readers</p>
        </button>
        <button
          type="button"
          onClick={() => setChoice("draft")}
          className={`rounded-xl border px-4 py-4 text-center transition ${
            choice === "draft"
              ? "border-[#907AFF] ring-1 ring-[#907AFF]/30"
              : "border-slate-100 hover:border-slate-200 dark:border-white/[0.08] dark:hover:border-white/[0.15]"
          }`}
        >
          <p className="text-sm font-semibold text-slate-800 dark:text-white/90">Save as draft</p>
          <p className="mt-1 text-xs text-slate-400 dark:text-white/40">Only you can see it</p>
        </button>
      </div>

      <div className="flex justify-center">
        <button
          type="button"
          disabled={isSaving}
          onClick={() => onComplete(choice)}
          className="rounded-full bg-emerald-600 px-8 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
        >
          {isSaving ? "Saving..." : choice === "publish" ? "Publish and finish" : "Save draft and finish"}
        </button>
      </div>
    </div>
  );
}
