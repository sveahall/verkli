"use client";

type ProductionAudioPreviewProps = {
  previewUrl: string;
};

export default function ProductionAudioPreview({
  previewUrl,
}: ProductionAudioPreviewProps) {
  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-white/35">
        Preview
      </p>
      <audio controls className="w-full" preload="none">
        <source src={previewUrl} />
      </audio>
    </div>
  );
}
