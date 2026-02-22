"use client";

import { useEffect, useMemo, useState } from "react";
import BookSelector from "@/components/marketing/BookSelector";
import ContentTypeSelector from "@/components/marketing/ContentTypeSelector";
import ChannelSelector from "@/components/marketing/ChannelSelector";
import CampaignConfigForm from "@/components/marketing/CampaignConfigForm";
import AssetPreviewArea from "@/components/marketing/AssetPreviewArea";
import type { Book, CampaignConfig, Channel, ContentType } from "@/lib/marketing/types";

type MarketingPortalProps = {
  books: Book[];
  initialBookId?: string | null;
};

const DEFAULT_CONTENT_TYPE: ContentType = "launch_post";
const DEFAULT_CHANNEL: Channel = "instagram";
const DEFAULT_CONFIG: CampaignConfig = {
  objective: "",
  tone: "inspiring",
  callToAction: "",
  includeHashtags: true,
};

export default function MarketingPortal({
  books,
  initialBookId = null,
}: MarketingPortalProps) {
  const resolvedInitialBookId = useMemo(() => {
    if (initialBookId && books.some((book) => book.id === initialBookId)) {
      return initialBookId;
    }
    return books[0]?.id ?? null;
  }, [books, initialBookId]);

  const [selectedBookId, setSelectedBookId] = useState<string | null>(resolvedInitialBookId);
  const [contentType, setContentType] = useState<ContentType>(DEFAULT_CONTENT_TYPE);
  const [channel, setChannel] = useState<Channel>(DEFAULT_CHANNEL);
  const [campaignConfig, setCampaignConfig] = useState<CampaignConfig>(DEFAULT_CONFIG);

  useEffect(() => {
    setSelectedBookId(resolvedInitialBookId);
  }, [resolvedInitialBookId]);

  const selectedBook = useMemo(
    () => books.find((book) => book.id === selectedBookId) ?? null,
    [books, selectedBookId]
  );

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-[1120px] px-6 py-10">
        <header className="mb-6">
          <h1 className="text-[28px] font-semibold tracking-tight text-slate-900 dark:text-white">
            Marketing Portal
          </h1>
          <p className="mt-1 text-[14px] text-slate-500 dark:text-white/50">
            Configure campaign intent and prepare reusable assets for each channel.
          </p>
        </header>

        {books.length === 0 ? (
          <section className="card-base p-8 text-center">
            <h2 className="text-[18px] font-semibold text-slate-900 dark:text-white">
              No books yet
            </h2>
            <p className="mt-2 text-[14px] text-slate-500 dark:text-white/50">
              Create a book first to unlock marketing setup.
            </p>
          </section>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-4">
              <BookSelector books={books} value={selectedBookId} onChange={setSelectedBookId} />
              <ContentTypeSelector value={contentType} onChange={setContentType} />
              <ChannelSelector value={channel} onChange={setChannel} />
              <CampaignConfigForm value={campaignConfig} onChange={setCampaignConfig} />
            </div>

            <AssetPreviewArea
              book={selectedBook}
              contentType={contentType}
              channel={channel}
              config={campaignConfig}
            />
          </div>
        )}
      </div>
    </main>
  );
}
