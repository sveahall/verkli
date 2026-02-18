"use client";

import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, type SelectOption } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToastHelpers } from "@/components/ui/toast";
import { LANGUAGE_OPTIONS } from "@/lib/languages";
import { resolveErrorMessage } from "@/lib/error-messages";
import type { CaptionChannel, ContentType } from "@/lib/marketing";

const CHANNELS: { value: CaptionChannel; label: string }[] = [
  { value: "tiktok", label: "TikTok" },
  { value: "instagram", label: "Instagram" },
  { value: "x", label: "X" },
  { value: "facebook", label: "Facebook" },
];

const CONTENT_TYPES: { value: ContentType; label: string }[] = [
  { value: "hook", label: "Hook" },
  { value: "blurb", label: "Blurb" },
  { value: "caption", label: "Social caption" },
];

const TONE_OPTIONS: SelectOption[] = [
  { value: "engaging", label: "Engaging" },
  { value: "formal", label: "Formal" },
  { value: "casual", label: "Casual" },
];

const LENGTH_OPTIONS: SelectOption[] = [
  { value: "short", label: "Short" },
  { value: "medium", label: "Medium" },
  { value: "long", label: "Long" },
];

type BookOption = { id: string; title: string };

type MarketingCaptionPortalProps = {
  books: BookOption[];
};

export default function MarketingCaptionPortal({ books }: MarketingCaptionPortalProps) {
  const toast = useToastHelpers();
  const [bookId, setBookId] = useState("");
  const [language, setLanguage] = useState("en");
  const [contentType, setContentType] = useState<ContentType>("caption");
  const [channel, setChannel] = useState<CaptionChannel>("instagram");
  const [tone, setTone] = useState("engaging");
  const [length, setLength] = useState("medium");
  const [cta, setCta] = useState("Read more on Verkli");
  const [previewText, setPreviewText] = useState("");
  const [generateLoading, setGenerateLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);

  useEffect(() => {
    if (books.length > 0 && !bookId) {
      setBookId(books[0].id);
    }
  }, [books, bookId]);

  const generateCaption = useCallback(async () => {
    if (!bookId) {
      toast.error("Choose a book.");
      return;
    }
    setGenerateLoading(true);
    try {
      const res = await fetch("/api/marketing/caption/generate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookId,
          language,
          contentType,
          channel,
          tone,
          length,
          cta: cta || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { caption?: string; error?: string; fromCache?: boolean };
      if (!res.ok) {
        toast.error(resolveErrorMessage(data.error));
        return;
      }
      if (typeof data.caption === "string") {
        setPreviewText(data.caption);
        toast.info(data.fromCache ? "Caption loaded from cache." : "Caption generated.");
      }
    } catch {
      toast.error("Could not generate caption.");
    } finally {
      setGenerateLoading(false);
    }
  }, [bookId, language, contentType, channel, tone, length, cta, toast]);

  const saveAsset = useCallback(async () => {
    if (!bookId || !previewText.trim()) {
      toast.error("Generate a caption and fill in text before saving.");
      return;
    }
    setSaveLoading(true);
    try {
      const res = await fetch("/api/marketing/assets", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookId,
          channel,
          language,
          contentType,
          text: previewText.trim(),
          metadata: { tone, length, cta },
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok) {
        toast.error(resolveErrorMessage(data.error));
        return;
      }
      toast.success("Caption saved as an asset.");
    } catch {
      toast.error("Could not save asset.");
    } finally {
      setSaveLoading(false);
    }
  }, [bookId, channel, language, contentType, previewText, tone, length, cta, toast]);

  const bookOptions: SelectOption[] = books.map((b) => ({ value: b.id, label: b.title || b.id }));
  const languageOptions: SelectOption[] = LANGUAGE_OPTIONS.map((o) => ({ value: o.value, label: o.label }));
  const channelOptions: SelectOption[] = CHANNELS.map((c) => ({ value: c.value, label: c.label }));
  const contentTypeOptions: SelectOption[] = CONTENT_TYPES.map((c) => ({ value: c.value, label: c.label }));

  if (books.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/50 bg-white/40 p-6 text-sm text-muted-foreground backdrop-blur-sm dark:border-white/10 dark:bg-white/5">
        Create at least one book in Books to use the caption portal.
      </div>
    );
  }

  const glassPanel =
    "rounded-2xl border border-white/60 bg-white/60 shadow-[0_0_0_1px_rgba(0,0,0,0.03),0_8px_30px_rgba(0,0,0,0.06)] backdrop-blur-xl dark:border-white/10 dark:bg-white/10 dark:shadow-[0_0_0_1px_rgba(255,255,255,0.05),0_8px_30px_rgba(0,0,0,0.25)]";

  return (
    <div className="space-y-8">
      <div className="grid gap-6 sm:gap-8 lg:grid-cols-2">
        <div
          className={`p-5 sm:p-6 ${glassPanel}`}
          style={{ WebkitBackdropFilter: "blur(24px)", backdropFilter: "blur(24px)" }}
        >
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            Book, content type, and channel
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Select a book and language, then choose content type and channel.
          </p>
          <div className="mt-5 space-y-4">
            <Select
              label="Book"
              options={bookOptions}
              value={bookId}
              onChange={(e) => setBookId(e.target.value)}
              fullWidth
              placeholder="Choose book"
            />
            <Select
              label="Language"
              options={languageOptions}
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              fullWidth
            />
            <Select
              label="Content type"
              options={contentTypeOptions}
              value={contentType}
              onChange={(e) => setContentType(e.target.value as ContentType)}
              fullWidth
            />
            <Select
              label="Channel"
              options={channelOptions}
              value={channel}
              onChange={(e) => setChannel(e.target.value as CaptionChannel)}
              fullWidth
            />
          </div>
        </div>

        <div
          className={`p-5 sm:p-6 ${glassPanel}`}
          style={{ WebkitBackdropFilter: "blur(24px)", backdropFilter: "blur(24px)" }}
        >
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            Tone, length, and CTA
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Control how captions are phrased and finished.
          </p>
          <div className="mt-5 space-y-4">
            <Select
              label="Tone"
              options={TONE_OPTIONS}
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              fullWidth
            />
            <Select
              label="Length"
              options={LENGTH_OPTIONS}
              value={length}
              onChange={(e) => setLength(e.target.value)}
              fullWidth
            />
            <Input
              label="Call-to-action (CTA)"
              value={cta}
              onChange={(e) => setCta(e.target.value)}
              placeholder="e.g. Read more on Verkli"
              fullWidth
            />
            <Button
              type="button"
              variant="primary"
              onClick={generateCaption}
              isLoading={generateLoading}
              loadingText="Generating..."
              className="mt-1 w-full bg-gradient-to-r from-[#907AFF] to-[#8069EE] shadow-[0_2px_12px_rgba(144,122,255,0.4)] hover:from-[#8069EE] hover:to-[#7058DD] hover:shadow-[0_4px_20px_rgba(144,122,255,0.35)] sm:w-auto"
            >
              Generate caption
            </Button>
          </div>
        </div>
      </div>

      <div
        className={`p-5 sm:p-6 ${glassPanel}`}
        style={{ WebkitBackdropFilter: "blur(24px)", backdropFilter: "blur(24px)" }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold tracking-tight text-foreground">Preview</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Edit text before saving as an asset.
            </p>
          </div>
          <Button
            type="button"
            variant="primary"
            onClick={saveAsset}
            isLoading={saveLoading}
            loadingText="Saving..."
            disabled={!previewText.trim()}
            className="bg-gradient-to-r from-[#907AFF] to-[#8069EE] shadow-[0_2px_12px_rgba(144,122,255,0.3)] hover:from-[#8069EE] hover:to-[#7058DD] hover:shadow-[0_4px_20px_rgba(144,122,255,0.3)]"
          >
            Save as asset
          </Button>
        </div>
        <Textarea
          className="mt-4 min-h-[120px] w-full resize-y rounded-xl border border-slate-200/80 bg-white/80 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground backdrop-blur-sm focus:border-[#907AFF]/50 focus:ring-2 focus:ring-[#907AFF]/20 dark:border-white/15 dark:bg-white/5 dark:placeholder:text-white/40"
          placeholder="Click Generate caption to fill this in..."
          value={previewText}
          onChange={(e) => setPreviewText(e.target.value)}
          rows={4}
        />
      </div>
    </div>
  );
}
