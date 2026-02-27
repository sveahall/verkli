"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
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
  const [isGenerating, setIsGenerating] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const prompt = useMemo(() => {
    const parts = [
      `Create a cinematic 5-second ${CONTENT_LABELS[contentType]} video preview for ${CHANNEL_LABELS[channel]}.`,
      `Book title: ${book?.title?.trim() || "Untitled book"}.`,
      `Tone: ${config.tone}.`,
      config.objective ? `Objective: ${config.objective}.` : "",
      config.callToAction ? `Call to action: ${config.callToAction}.` : "",
    ];
    return parts.filter(Boolean).join(" ");
  }, [book?.title, channel, config.callToAction, config.objective, config.tone, contentType]);

  const canGenerate = Boolean(book?.id && book?.cover_image && !isGenerating);

  useEffect(() => {
    setVideoUrl(null);
    setErrorMessage(null);
  }, [book?.id]);

  const handleGenerate = async () => {
    if (!book?.id) {
      setErrorMessage("Select a book first.");
      return;
    }
    if (!book.cover_image) {
      setErrorMessage("Add a cover image to your book first.");
      return;
    }

    setErrorMessage(null);
    setIsGenerating(true);

    try {
      const response = await fetch("/api/marketing/video/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookId: book.id,
          prompt,
          imageUrl: book.cover_image,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { detail?: string };
        setErrorMessage(payload.detail || "Something went wrong. Try again \u2014 you won\u2019t be charged twice.");
        return;
      }

      const payload = (await response.json()) as { url?: string };
      if (!payload.url) {
        setErrorMessage("Build finished but no file was returned. Try again.");
        return;
      }

      setVideoUrl(payload.url);
    } catch {
      setErrorMessage("Connection lost. Check your network and try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <aside className="card-base p-5 lg:sticky lg:top-24 lg:h-fit">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">Preview</h2>
        <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-300">
          Beta
        </span>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/[0.03]">
        <div className="relative aspect-[4/5] w-full">
          {videoUrl ? (
            <video controls src={videoUrl} className="h-full w-full object-cover" playsInline />
          ) : book?.cover_image ? (
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
              Cover preview appears here.
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
          <dd className="text-right font-medium">{config.callToAction || "\u2014"}</dd>
        </div>
      </dl>

      <button
        type="button"
        disabled={!canGenerate}
        onClick={handleGenerate}
        className="btn-primary mt-5 w-full disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isGenerating ? "Generating\u2026" : "Generate video"}
      </button>

      {errorMessage && (
        <p className="mt-2 text-[12px] font-medium text-red-600 dark:text-red-400">{errorMessage}</p>
      )}
    </aside>
  );
}
