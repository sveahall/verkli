"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useToastHelpers } from "@/components/ui/toast";
import { resolveErrorMessage } from "@/lib/error-messages";
import { normalizeLanguage, type SupportedLanguage } from "@/lib/languages";
import {
  MARKETING_CHANNELS,
  MARKETING_CHANNEL_LABELS,
  type MarketingChannel,
} from "../BookEditorView.helpers";
import type {
  Book,
  BookVersion,
  MarketingCampaignRow,
} from "../BookEditorView.types";

interface UseMarketingOptions {
  book: Book;
  marketingCampaigns: MarketingCampaignRow[];
  activeVersion: BookVersion | null;
}

export function useMarketing({
  book,
  marketingCampaigns,
  activeVersion,
}: UseMarketingOptions) {
  const router = useRouter();
  const toast = useToastHelpers();

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  const [marketingChannel, setMarketingChannel] = useState<MarketingChannel>("generic");
  const [marketingLanguage, setMarketingLanguage] = useState<SupportedLanguage>(
    normalizeLanguage(activeVersion?.language_code ?? book.original_language ?? book.language),
  );
  const [marketingCopyFeedback, setMarketingCopyFeedback] = useState(false);
  const [isGeneratingMarketing, setIsGeneratingMarketing] = useState(false);

  // ---------------------------------------------------------------------------
  // Computed
  // ---------------------------------------------------------------------------
  const currentCampaign =
    marketingCampaigns.find(
      (c) => c.language === marketingLanguage && c.channel === marketingChannel,
    ) ?? null;

  // Sync marketingLanguage when the active version changes
  const derivedLanguage = normalizeLanguage(activeVersion?.language_code ?? book.original_language ?? book.language);
  const [prevDerivedLanguage, setPrevDerivedLanguage] = useState(derivedLanguage);
  if (prevDerivedLanguage !== derivedLanguage) {
    setPrevDerivedLanguage(derivedLanguage);
    setMarketingLanguage(derivedLanguage);
  }

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleGenerateMarketingCopy = useCallback(async () => {
    if (isGeneratingMarketing) return;
    setIsGeneratingMarketing(true);
    try {
      const res = await fetch(`/api/books/${book.id}/marketing/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: marketingLanguage, channel: marketingChannel }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(resolveErrorMessage(data.error));
        return;
      }
      router.refresh();
    } catch {
      toast.error("Could not generate. Try again.");
    } finally {
      setIsGeneratingMarketing(false);
    }
  }, [book.id, marketingLanguage, marketingChannel, isGeneratingMarketing, router, toast]);

  const handleCopyMarketingToClipboard = useCallback(async () => {
    if (!currentCampaign) return;
    const parts: string[] = [];
    if (currentCampaign.caption) parts.push(currentCampaign.caption);
    if (currentCampaign.hashtags) parts.push(currentCampaign.hashtags);
    if (currentCampaign.share_url) {
      const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
      parts.push(`${baseUrl}${currentCampaign.share_url}`);
    }
    const text = parts.join("\n\n");
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setMarketingCopyFeedback(true);
      setTimeout(() => setMarketingCopyFeedback(false), 2000);
    } catch {
      setMarketingCopyFeedback(false);
    }
  }, [currentCampaign]);

  // ---------------------------------------------------------------------------
  // Return
  // ---------------------------------------------------------------------------

  return {
    // State
    marketingChannel,
    setMarketingChannel,
    marketingLanguage,
    setMarketingLanguage,
    marketingCopyFeedback,
    isGeneratingMarketing,

    // Computed
    currentCampaign,

    // Handlers
    handleGenerateMarketingCopy,
    handleCopyMarketingToClipboard,

    // Re-export constants so consumers don't need a second import
    MARKETING_CHANNELS,
    MARKETING_CHANNEL_LABELS,
  };
}
