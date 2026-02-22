import Image from "next/image";
import type { Book, CampaignConfig, Channel, ContentType } from "@/lib/marketing/types";

const CONTENT_LABELS: Record<ContentType, string> = {
  launch_post: "Launch Post",
  teaser: "Teaser",
  quote_card: "Quote Card",
};

const CHANNEL_LABELS: Record<Channel, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  x: "X",
  facebook: "Facebook",
};

type AssetPreviewAreaProps = {
  book: Book | null;
  contentType: ContentType;
  channel: Channel;
  config: CampaignConfig;
};

export default function AssetPreviewArea({
  book,
  contentType,
  channel,
  config,
}: AssetPreviewAreaProps) {
  return (
    <aside className="card-base p-5 lg:sticky lg:top-24 lg:h-fit">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">Asset Preview</h2>
        <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-300">
          Soon
        </span>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/[0.03]">
        <div className="relative aspect-[4/5] w-full">
          {book?.cover_image ? (
            <Image
              src={book.cover_image}
              alt={book.title ?? "Book cover"}
              fill
              className="object-cover"
              sizes="(min-width: 1024px) 340px, 100vw"
              unoptimized
            />
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center text-[13px] text-slate-400 dark:text-white/35">
              Cover preview will appear here.
            </div>
          )}
        </div>
      </div>

      <dl className="mt-4 space-y-2 text-[13px] text-slate-700 dark:text-white/80">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200/80 pb-2 dark:border-white/10">
          <dt className="text-slate-500 dark:text-white/50">Book</dt>
          <dd className="text-right font-medium">{book?.title?.trim() || "Untitled book"}</dd>
        </div>
        <div className="flex items-start justify-between gap-3 border-b border-slate-200/80 pb-2 dark:border-white/10">
          <dt className="text-slate-500 dark:text-white/50">Type</dt>
          <dd className="text-right font-medium">{CONTENT_LABELS[contentType]}</dd>
        </div>
        <div className="flex items-start justify-between gap-3 border-b border-slate-200/80 pb-2 dark:border-white/10">
          <dt className="text-slate-500 dark:text-white/50">Channel</dt>
          <dd className="text-right font-medium">{CHANNEL_LABELS[channel]}</dd>
        </div>
        <div className="flex items-start justify-between gap-3 border-b border-slate-200/80 pb-2 dark:border-white/10">
          <dt className="text-slate-500 dark:text-white/50">Tone</dt>
          <dd className="text-right font-medium capitalize">{config.tone}</dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt className="text-slate-500 dark:text-white/50">CTA</dt>
          <dd className="text-right font-medium">{config.callToAction || "None yet"}</dd>
        </div>
      </dl>

      <button
        type="button"
        disabled
        className="btn-primary mt-5 w-full cursor-not-allowed opacity-60"
      >
        Generate
      </button>
    </aside>
  );
}
