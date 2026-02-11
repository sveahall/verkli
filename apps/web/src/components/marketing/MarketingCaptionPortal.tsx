"use client";

import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
  { value: "engaging", label: "Engagerande" },
  { value: "formal", label: "Formell" },
  { value: "casual", label: "Avslappnad" },
];

const LENGTH_OPTIONS: SelectOption[] = [
  { value: "short", label: "Kort" },
  { value: "medium", label: "Medium" },
  { value: "long", label: "Lång" },
];

type BookOption = { id: string; title: string };

type MarketingCaptionPortalProps = {
  books: BookOption[];
};

export default function MarketingCaptionPortal({ books }: MarketingCaptionPortalProps) {
  const toast = useToastHelpers();
  const [bookId, setBookId] = useState("");
  const [language, setLanguage] = useState("sv");
  const [contentType, setContentType] = useState<ContentType>("caption");
  const [channel, setChannel] = useState<CaptionChannel>("instagram");
  const [tone, setTone] = useState("engaging");
  const [length, setLength] = useState("medium");
  const [cta, setCta] = useState("Läs mer på Verkli");
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
      toast.error("Välj en bok.");
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
        toast.info(data.fromCache ? "Caption från cache." : "Caption genererad.");
      }
    } catch {
      toast.error("Kunde inte generera caption.");
    } finally {
      setGenerateLoading(false);
    }
  }, [bookId, language, contentType, channel, tone, length, cta, toast]);

  const saveAsset = useCallback(async () => {
    if (!bookId || !previewText.trim()) {
      toast.error("Generera en caption och fyll i text innan du sparar.");
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
      toast.success("Caption sparad som asset.");
    } catch {
      toast.error("Kunde inte spara asset.");
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
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-sm text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-white/70">
        Skapa minst en bok under Böcker för att använda caption-portalen.
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            Bok, innehållstyp och kanal
          </h3>
          <p className="text-xs text-slate-500 dark:text-white/50">
            Välj bok och språk, sedan typ av text och kanal för format.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select
            label="Bok"
            options={bookOptions}
            value={bookId}
            onChange={(e) => setBookId(e.target.value)}
            fullWidth
            placeholder="Välj bok"
          />
          <Select
            label="Språk"
            options={languageOptions}
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            fullWidth
          />
          <Select
            label="Innehållstyp"
            options={contentTypeOptions}
            value={contentType}
            onChange={(e) => setContentType(e.target.value as ContentType)}
            fullWidth
          />
          <Select
            label="Kanal"
            options={channelOptions}
            value={channel}
            onChange={(e) => setChannel(e.target.value as CaptionChannel)}
            fullWidth
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            Ton, längd och CTA
          </h3>
          <p className="text-xs text-slate-500 dark:text-white/50">
            Styr hur captions formuleras och avslutas.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select
            label="Ton"
            options={TONE_OPTIONS}
            value={tone}
            onChange={(e) => setTone(e.target.value)}
            fullWidth
          />
          <Select
            label="Längd"
            options={LENGTH_OPTIONS}
            value={length}
            onChange={(e) => setLength(e.target.value)}
            fullWidth
          />
          <Input
            label="Call-to-action (CTA)"
            value={cta}
            onChange={(e) => setCta(e.target.value)}
            placeholder="T.ex. Läs mer på Verkli"
            fullWidth
          />
          <Button
            type="button"
            variant="primary"
            onClick={generateCaption}
            isLoading={generateLoading}
            loadingText="Genererar..."
            fullWidth
          >
            Generera caption
          </Button>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader className="pb-2">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            Förhandsgranskning
          </h3>
          <p className="text-xs text-slate-500 dark:text-white/50">
            Redigera texten om du vill innan du sparar som asset.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            className="min-h-[160px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 dark:border-white/20 dark:bg-white/10 dark:text-white dark:placeholder:text-white/40"
            placeholder="Klicka på Generera caption för att fylla i..."
            value={previewText}
            onChange={(e) => setPreviewText(e.target.value)}
            rows={6}
          />
          <div className="flex justify-end">
            <Button
              type="button"
              variant="primary"
              onClick={saveAsset}
              isLoading={saveLoading}
              loadingText="Sparar..."
              disabled={!previewText.trim()}
            >
              Spara som asset
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
