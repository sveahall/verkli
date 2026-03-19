"use client";

import ManifestAudiobookPlayer from "@/components/books/ManifestAudiobookPlayer";
import NoDownloadAudioPlayer from "@/components/books/NoDownloadAudioPlayer";

type ProductionAudioPreviewProps = {
  bookId: string;
  audioUrl: string | null;
  manifestUrl: string | null;
};

export default function ProductionAudioPreview({
  bookId,
  audioUrl,
  manifestUrl,
}: ProductionAudioPreviewProps) {
  if (!audioUrl && !manifestUrl) {
    return null;
  }

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-white/35">
        Audiobook
      </p>
      {audioUrl ? (
        <NoDownloadAudioPlayer src={audioUrl} />
      ) : manifestUrl ? (
        <ManifestAudiobookPlayer bookId={bookId} manifestUrl={manifestUrl} />
      ) : null}
    </div>
  );
}
