"use client";

import Link from "next/link";
import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { uploadBookCover } from "@/lib/supabase/storage";
import TiptapEditor from "@/components/editor/TiptapEditor";
import AuthorStatsBar from "@/components/editor/AuthorStatsBar";
import CommandPalette from "@/components/editor/CommandPalette";
import DeleteBookButton from "@/components/books/DeleteBookButton";
import { getAudiobookEnabled, getMarketingEnabled, getTranslationsEnabled } from "@/lib/flags";
import { getLanguageLabel, LANGUAGE_OPTIONS, normalizeLanguage, type SupportedLanguage } from "@/lib/languages";

const ACCEPTED_COVER_TYPES = "image/*";

const STORAGE_PRESET = "verkli_editor_preset";

type Chapter = {
  id: string;
  title: string;
  content: string | null;
  order: number;
  book_version_id: string;
};

type PublishVisibility = "public" | "followers" | "private";

const VISIBILITY_LABELS: Record<PublishVisibility, string> = {
  public: "Public",
  followers: "Followers only",
  private: "Private",
};

const PUBLISH_VISIBILITY_OPTIONS: Array<{
  value: PublishVisibility;
  label: string;
  description: string;
}> = [
  {
    value: "public",
    label: "Public",
    description: "Visible to everyone. Appears in Discover and on your profile.",
  },
  {
    value: "followers",
    label: "Followers only",
    description: "Visible only to readers who follow you.",
  },
  {
    value: "private",
    label: "Private",
    description: "Only you can see this version.",
  },
];

function normalizeLangKey(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeVisibility(value: string | null | undefined): PublishVisibility | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "public" || normalized === "followers" || normalized === "private") {
    return normalized;
  }
  return null;
}

function extractText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  if ("text" in node && typeof (node as { text?: string }).text === "string") {
    return (node as { text: string }).text;
  }
  if ("content" in node && Array.isArray((node as { content?: unknown[] }).content)) {
    return (node as { content: unknown[] }).content.map(extractText).join("");
  }
  return "";
}

function hasReadableContent(content: string | null): boolean {
  if (!content) return false;
  try {
    const parsed = JSON.parse(content);
    const text = extractText(parsed);
    return text.trim().length > 0;
  } catch {
    return content.trim().length > 0;
  }
}

function describeVisibility(value: PublishVisibility): string {
  if (value === "public") return "Visible to everyone";
  if (value === "followers") return "Visible to followers only";
  return "Only you can see this version";
}

const MARKETING_CHANNELS = ["generic", "tiktok", "instagram", "x"] as const;
type MarketingChannel = (typeof MARKETING_CHANNELS)[number];

type MarketingCampaignRow = {
  id: string;
  book_id: string;
  language: string;
  channel: string;
  status: string;
  headline: string | null;
  caption: string | null;
  cta: string | null;
  hashtags: string | null;
  share_url: string | null;
  created_at: string;
  updated_at: string;
};

type Book = {
  id: string;
  title: string;
  description: string | null;
  cover_image: string | null;
  status: string;
  language?: string | null;
  original_language?: string | null;
  original_source?: string | null;
  original_url?: string | null;
  audiobook_status?: string | null;
};

type BookVersion = {
  id: string;
  book_id: string;
  language_code: string;
  status: string;
  published_at?: string | null;
  visibility?: PublishVisibility | null;
  created_at?: string;
  updated_at?: string;
};

type LatestAudiobookAsset = {
  id: string;
  audio_url: string | null;
  status: string;
  created_at: string;
} | null;

const TRANSLATION_POLL_MAX_MS = 120_000;

type Props = {
  book: Book;
  chapters: Chapter[];
  bookVersions: BookVersion[];
  activeVersion: BookVersion | null;
  latestAudiobookAsset?: LatestAudiobookAsset;
  marketingCampaigns?: MarketingCampaignRow[];
};

export default function BookEditor({
  book,
  chapters: initialChapters,
  bookVersions,
  activeVersion,
  latestAudiobookAsset = null,
  marketingCampaigns = [],
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [chapters, setChapters] = useState<Chapter[]>(initialChapters);
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(
    initialChapters[0]?.id ?? null
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [tempTitle, setTempTitle] = useState("");
  const [bookTitle, setBookTitle] = useState(book.title ?? "Untitled");
  const [isRenamingBook, setIsRenamingBook] = useState(false);
  const [bookTitleDraft, setBookTitleDraft] = useState(book.title ?? "Untitled");
  const [bookTitleError, setBookTitleError] = useState<string | null>(null);
  const [bookTitleSaving, setBookTitleSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [preset, setPreset] = useState("novel");
  const [wordCount, setWordCount] = useState(0);
  const [sessionStartWords, setSessionStartWords] = useState<number | null>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishVisibility, setPublishVisibility] = useState<PublishVisibility>("public");
  const [defaultPublishVisibility, setDefaultPublishVisibility] = useState<PublishVisibility>("public");
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishToast, setPublishToast] = useState<string | null>(null);
  const [confirmPublishAction, setConfirmPublishAction] = useState<"publish" | "update" | "unpublish" | null>(null);
  const [publishPanelHighlight, setPublishPanelHighlight] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
  const [originalUrl, setOriginalUrl] = useState(book.original_url ?? "");
  const [marketingChannel, setMarketingChannel] = useState<MarketingChannel>("generic");
  const [marketingLanguage, setMarketingLanguage] = useState<SupportedLanguage>(
    normalizeLanguage(activeVersion?.language_code ?? book.original_language ?? book.language)
  );
  const [marketingCopyFeedback, setMarketingCopyFeedback] = useState(false);
  const [isGeneratingMarketing, setIsGeneratingMarketing] = useState(false);
  const existingVersionLanguages = useMemo(() => {
    const langs = new Set<string>();
    for (const v of bookVersions) {
      const key = normalizeLangKey(v.language_code);
      if (key) langs.add(key);
    }
    return langs;
  }, [bookVersions]);
  const initialTargetLanguage = useMemo<SupportedLanguage>(() => {
    const currentLang = normalizeLanguage(activeVersion?.language_code ?? book.original_language ?? book.language);
    const preferred = currentLang === "en" ? "sv" : "en";
    if (!existingVersionLanguages.has(preferred)) return preferred;
    for (const opt of LANGUAGE_OPTIONS) {
      if (!existingVersionLanguages.has(opt.value)) return opt.value;
    }
    return preferred;
  }, [activeVersion?.language_code, book.original_language, book.language, existingVersionLanguages]);
  const [translateTargetLanguage, setTranslateTargetLanguage] = useState<SupportedLanguage>(initialTargetLanguage);
  const [isStartingTranslation, setIsStartingTranslation] = useState(false);
  const [isPollingTranslation, setIsPollingTranslation] = useState(false);
  const [translateMessage, setTranslateMessage] = useState<string | null>(null);
  const [lastRequestedTargetLanguage, setLastRequestedTargetLanguage] = useState<SupportedLanguage | null>(null);
  const translationPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const translationPollStartedAtRef = useRef<number>(0);
  const [isGeneratingAudiobook, setIsGeneratingAudiobook] = useState(false);
  const [audiobookError, setAudiobookError] = useState<string | null>(null);
  const [ttsStatus, setTtsStatus] = useState<"idle" | "generating" | "uploading" | "done" | "error">("idle");
  const [ttsMessage, setTtsMessage] = useState<string | null>(null);
  const [ttsManualSteps, setTtsManualSteps] = useState<string | null>(null);
  const [ttsAudioUrl, setTtsAudioUrl] = useState<string | null>(null);
  const [ttsVoice, setTtsVoice] = useState<string>("default");
  const savingRef = useRef(false);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const publishPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setChapters(initialChapters);
    setSelectedChapterId(initialChapters[0]?.id ?? null);
  }, [initialChapters]);

  useEffect(() => {
    if (!publishToast) return;
    const timeoutId = window.setTimeout(() => setPublishToast(null), 3000);
    return () => window.clearTimeout(timeoutId);
  }, [publishToast]);

  useEffect(() => {
    setPublishError(null);
    setConfirmPublishAction(null);
  }, [activeVersion?.id]);

  useEffect(() => {
    let isActive = true;
    const loadDefaultVisibility = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("preferences")
        .eq("user_id", user.id)
        .maybeSingle();
      const preferred =
        (profile?.preferences as { visibility?: { books?: string } } | null)?.visibility?.books ?? null;
      if (
        isActive &&
        (preferred === "public" || preferred === "followers" || preferred === "private")
      ) {
        setDefaultPublishVisibility(preferred);
      }
    };
    void loadDefaultVisibility();
    return () => {
      isActive = false;
    };
  }, []);

  const panelParam = searchParams?.get("panel");
  useEffect(() => {
    if (panelParam !== "publish") return;
    publishPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    setPublishPanelHighlight(true);
    const timeoutId = window.setTimeout(() => setPublishPanelHighlight(false), 1600);
    return () => window.clearTimeout(timeoutId);
  }, [panelParam]);

  const selectedChapter = chapters.find((ch) => ch.id === selectedChapterId);
  const displayCoverUrl = coverPreviewUrl ?? book.cover_image;
  const activeVisibility = useMemo(
    () => normalizeVisibility(activeVersion?.visibility ?? null),
    [activeVersion?.visibility]
  );

  useEffect(() => {
    if (!activeVersion) return;
    const nextVisibility = activeVisibility ?? defaultPublishVisibility;
    setPublishVisibility(nextVisibility);
  }, [activeVersion, activeVisibility, defaultPublishVisibility]);

  const activeLanguage = normalizeLanguage(
    activeVersion?.language_code ?? book.original_language ?? book.language
  );
  const isPublished = Boolean(activeVersion?.published_at);
  const currentVisibility = activeVisibility ?? publishVisibility;
  const currentVisibilityLabel = VISIBILITY_LABELS[currentVisibility];
  const currentVisibilitySummary = describeVisibility(currentVisibility);
  const selectedVisibilityLabel = VISIBILITY_LABELS[publishVisibility];

  const missingPublishRequirements = useMemo(() => {
    const missing: string[] = [];
    if (!bookTitle.trim()) missing.push("Add a title");
    if (!displayCoverUrl) missing.push("Upload a cover image");
    if (!activeVersion?.id) missing.push("Create a book version");
    if (chapters.length === 0) {
      missing.push("Add at least one chapter");
    } else if (!chapters.some((chapter) => hasReadableContent(chapter.content))) {
      missing.push("Write content in at least one chapter");
    }
    return missing;
  }, [bookTitle, displayCoverUrl, activeVersion?.id, chapters]);

  const publishDisabled = isPublishing || coverUploading || missingPublishRequirements.length > 0;
  const visibilityChanged = isPublished && activeVisibility != null && publishVisibility !== activeVisibility;
  const confirmCopy =
    confirmPublishAction === "publish"
      ? `Publish this version as ${selectedVisibilityLabel}?`
      : confirmPublishAction === "update"
        ? `Update visibility to ${selectedVisibilityLabel}?`
        : confirmPublishAction === "unpublish"
          ? "Unpublish this version? It will no longer be visible to readers."
          : null;

  const versionsByLang = useMemo(() => {
    const map = new Map<string, BookVersion>();
    for (const v of bookVersions) {
      const key = normalizeLangKey(v.language_code);
      if (!key) continue;
      map.set(key, v);
    }
    return map;
  }, [bookVersions]);

  const currentTargetVersion = useMemo(
    () => versionsByLang.get(normalizeLangKey(translateTargetLanguage)),
    [versionsByLang, translateTargetLanguage]
  );

  const requestedTargetVersion = useMemo(
    () => (lastRequestedTargetLanguage ? versionsByLang.get(normalizeLangKey(lastRequestedTargetLanguage)) : null),
    [versionsByLang, lastRequestedTargetLanguage]
  );

  const requestedTargetVersionRef = useRef<BookVersion | null>(null);

  useEffect(() => {
    requestedTargetVersionRef.current = requestedTargetVersion ?? null;
  }, [requestedTargetVersion]);

  const stopTranslationPoll = useCallback(() => {
    if (translationPollRef.current) {
      clearInterval(translationPollRef.current);
      translationPollRef.current = null;
    }
    setIsPollingTranslation(false);
  }, []);

  useEffect(() => {
    if (!isPollingTranslation || !lastRequestedTargetLanguage) return;
    if (requestedTargetVersion?.status === "done" || requestedTargetVersion?.published_at) {
      stopTranslationPoll();
      setTranslateMessage(`Översättning klar (${getLanguageLabel(lastRequestedTargetLanguage)}).`);
      setLastRequestedTargetLanguage(null);
      return;
    }
    if (requestedTargetVersion?.status === "failed") {
      stopTranslationPoll();
      setTranslateMessage("Översättningen misslyckades. Försök igen.");
      setLastRequestedTargetLanguage(null);
    }
  }, [isPollingTranslation, lastRequestedTargetLanguage, requestedTargetVersion, stopTranslationPoll]);

  useEffect(() => {
    return () => {
      stopTranslationPoll();
    };
  }, [stopTranslationPoll]);

  useEffect(() => {
    setTranslateMessage(null);
  }, [translateTargetLanguage]);

  type TranslationUiStatus = "idle" | "translating" | "done" | "error";
  const isPollingCurrent = isPollingTranslation && lastRequestedTargetLanguage === translateTargetLanguage;
  const translationUiStatus = useMemo<TranslationUiStatus>(() => {
    if (currentTargetVersion?.status === "failed") return "error";
    if (currentTargetVersion?.status === "translating" || isPollingCurrent) return "translating";
    if (currentTargetVersion?.status === "done" || currentTargetVersion?.published_at) return "done";
    return "idle";
  }, [currentTargetVersion?.status, currentTargetVersion?.published_at, isPollingCurrent]);

  const startTranslationPoll = useCallback(() => {
    stopTranslationPoll();
    translationPollStartedAtRef.current = Date.now();
    setIsPollingTranslation(true);
    translationPollRef.current = setInterval(() => {
      const info = requestedTargetVersionRef.current;
      const status = info?.status ?? "none";
      const elapsed = Date.now() - translationPollStartedAtRef.current;
      if (elapsed >= TRANSLATION_POLL_MAX_MS && status === "none") {
        stopTranslationPoll();
        setTranslateMessage("Översättning tar för lång tid. Försök igen.");
        setLastRequestedTargetLanguage(null);
        return;
      }
      router.refresh();
    }, 3000);
  }, [router, stopTranslationPoll]);

  const handleStartTranslation = useCallback(async () => {
    if (isStartingTranslation) return;
    setIsStartingTranslation(true);
    setTranslateMessage(null);

    if (!activeVersion?.id) {
      setTranslateMessage("Ingen aktiv version hittades.");
      setIsStartingTranslation(false);
      return;
    }

    const existingVersion = versionsByLang.get(normalizeLangKey(translateTargetLanguage));
    if (existingVersion?.status === "translating") {
      setTranslateMessage("Översättning pågår redan. Väntar på att den blir klar…");
      setLastRequestedTargetLanguage(translateTargetLanguage);
      startTranslationPoll();
      setIsStartingTranslation(false);
      return;
    }

    let overwrite = false;
    let targetVersionId: string | null = null;
    if (existingVersion) {
      const shouldOverwrite = window.confirm(
        `En version på ${getLanguageLabel(translateTargetLanguage)} finns redan. Vill du skriva över den?`
      );
      if (!shouldOverwrite) {
        router.push(`/author/books/${book.id}?lang=${normalizeLangKey(translateTargetLanguage)}`);
        setIsStartingTranslation(false);
        return;
      }
      overwrite = true;
      targetVersionId = existingVersion.id;
    }

    try {
      const res = await fetch(`/api/books/${book.id}/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetLanguage: translateTargetLanguage,
          sourceVersionId: activeVersion.id,
          targetVersionId,
          overwrite,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        const errMsg = data?.error ?? "Failed to start translation";
        if (data?.existingVersionId) {
          setTranslateMessage("Version finns redan. Öppnar befintlig version…");
          router.push(`/author/books/${book.id}?lang=${normalizeLangKey(translateTargetLanguage)}`);
          return;
        }
        setTranslateMessage(errMsg);
        return;
      }
      setTranslateMessage("Översättning startad. Väntar på att den blir klar…");
      setLastRequestedTargetLanguage(translateTargetLanguage);
      startTranslationPoll();
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Failed to start translation";
      setTranslateMessage(errMsg);
    } finally {
      setIsStartingTranslation(false);
    }
  }, [
    isStartingTranslation,
    startTranslationPoll,
    translateTargetLanguage,
    activeVersion?.id,
    versionsByLang,
    book.id,
    router,
  ]);

  const handlePublishAction = async (action: "publish" | "update" | "unpublish") => {
    if (isPublishing || !activeVersion?.id) return;
    if (action === "publish" && missingPublishRequirements.length > 0) {
      setPublishError("Fix the required items before publishing.");
      return;
    }
    setIsPublishing(true);
    setPublishError(null);
    try {
      const res = await fetch(`/api/books/${book.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          versionId: activeVersion.id,
          visibility: publishVisibility,
          action,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPublishError(data.error || "Failed to update publish settings");
        return;
      }
      router.refresh();
      if (action === "publish") {
        setPublishToast("Published");
      } else if (action === "unpublish") {
        setPublishToast("Unpublished");
      } else {
        setPublishToast("Publish settings updated");
      }
    } catch (err) {
      if (process.env.NODE_ENV === "development") {
        console.error("[publish failed]", err);
      }
      setPublishError("Failed to update publish settings");
    } finally {
      setIsPublishing(false);
      setConfirmPublishAction(null);
    }
  };

  useEffect(() => {
    if (book.cover_image && coverPreviewUrl && book.cover_image === coverPreviewUrl) {
      setCoverPreviewUrl(null);
    }
  }, [book.cover_image, coverPreviewUrl]);

  const handleCoverChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        setCoverError("Please choose an image file.");
        return;
      }
      setCoverError(null);
      setCoverUploading(true);
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setCoverError("You must be signed in to upload a cover.");
        setCoverUploading(false);
        return;
      }
      const { url, error: uploadError } = await uploadBookCover(file, user.id, book.id);
      if (uploadError) {
        setCoverError(uploadError.message);
        setCoverUploading(false);
        return;
      }
      if (!url) {
        setCoverError("Upload failed.");
        setCoverUploading(false);
        return;
      }
      const { error: updateError } = await supabase
        .from("books")
        .update({ cover_image: url })
        .eq("id", book.id);
      if (updateError) {
        setCoverError(updateError.message);
        setCoverUploading(false);
        return;
      }
      setCoverPreviewUrl(url);
      setCoverUploading(false);
      router.refresh();
      if (coverInputRef.current) coverInputRef.current.value = "";
    },
    [book.id, router]
  );

  const handleOriginalUrlBlur = useCallback(async () => {
    const val = originalUrl.trim() || null;
    if (val === (book.original_url ?? "")) return;
    const supabase = createClient();
    const { error } = await supabase.from("books").update({ original_url: val }).eq("id", book.id);
    if (!error) router.refresh();
  }, [book.id, book.original_url, originalUrl, router]);

  const handleStartRenameBook = useCallback(() => {
    setBookTitleError(null);
    setBookTitleDraft(bookTitle);
    setIsRenamingBook(true);
  }, [bookTitle]);

  const handleCancelRenameBook = useCallback(() => {
    setBookTitleError(null);
    setBookTitleDraft(bookTitle);
    setIsRenamingBook(false);
  }, [bookTitle]);

  const handleSaveRenameBook = useCallback(async () => {
    if (bookTitleSaving) return;
    const trimmed = bookTitleDraft.trim();
    if (!trimmed) {
      setBookTitleError("Titel kan inte vara tom.");
      return;
    }
    if (trimmed.length > 120) {
      setBookTitleError("Titeln är för lång (max 120 tecken).");
      return;
    }
    if (trimmed === bookTitle) {
      setIsRenamingBook(false);
      return;
    }
    setBookTitleSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from("books").update({ title: trimmed }).eq("id", book.id);
    if (error) {
      setBookTitleError(error.message);
      setBookTitleSaving(false);
      return;
    }
    setBookTitle(trimmed);
    setIsRenamingBook(false);
    setBookTitleSaving(false);
    router.refresh();
  }, [bookTitleDraft, bookTitle, book.id, bookTitleSaving, router]);

  useEffect(() => {
    setOriginalUrl(book.original_url ?? "");
  }, [book.original_url]);

  useEffect(() => {
    setBookTitle(book.title ?? "Untitled");
    if (!isRenamingBook) {
      setBookTitleDraft(book.title ?? "Untitled");
    }
  }, [book.title, isRenamingBook]);

  useEffect(() => {
    setMarketingLanguage(
      normalizeLanguage(activeVersion?.language_code ?? book.original_language ?? book.language)
    );
  }, [activeVersion?.language_code, book.original_language, book.language]);

  const handleGenerateAudiobook = useCallback(async () => {
    if (isGeneratingAudiobook) return;
    setAudiobookError(null);
    setIsGeneratingAudiobook(true);
    try {
      const res = await fetch(`/api/books/${book.id}/audiobook/generate`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAudiobookError(data.error ?? "Generate failed");
        return;
      }
      router.refresh();
    } catch {
      setAudiobookError("Generate failed");
    } finally {
      setIsGeneratingAudiobook(false);
    }
  }, [book.id, isGeneratingAudiobook, router]);

  const handleStartTts = useCallback(async () => {
    setTtsMessage(null);
    setTtsManualSteps(null);
    setTtsStatus("generating");
    try {
      const res = await fetch(`/api/books/${book.id}/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voice: ttsVoice }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        setTtsStatus("error");
        setTtsMessage(data?.error ?? "TTS failed");
        setTtsManualSteps(data?.manualSteps ?? null);
        return;
      }
      setTtsAudioUrl(data.audioUrl ?? null);
      setTtsStatus("done");
      setTtsMessage("Ljud genererat. Du kan spela upp eller ladda ner.");
      setTtsManualSteps(null);
      router.refresh();
    } catch (err) {
      setTtsStatus("error");
      setTtsMessage(err instanceof Error ? err.message : "TTS failed");
      setTtsManualSteps(null);
    }
  }, [book.id, ttsVoice, router]);

  const currentCampaign = marketingCampaigns.find(
    (c) => c.language === marketingLanguage && c.channel === marketingChannel
  ) ?? null;

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
        alert(data.error ?? "Generate failed");
        return;
      }
      router.refresh();
    } catch {
      alert("Generate failed");
    } finally {
      setIsGeneratingMarketing(false);
    }
  }, [book.id, marketingLanguage, marketingChannel, isGeneratingMarketing, router]);

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

  useEffect(() => {
    if (latestAudiobookAsset?.audio_url && ttsStatus === "idle") {
      setTtsStatus("done");
    }
  }, [latestAudiobookAsset?.audio_url, ttsStatus]);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_PRESET);
    if (stored && ["novel", "essay", "screenplay"].includes(stored)) setPreset(stored);
  }, []);

  useEffect(() => {
    if (preset) localStorage.setItem(STORAGE_PRESET, preset);
  }, [preset]);

  useEffect(() => {
    if (selectedChapterId && sessionStartWords === null) {
      const ch = chapters.find((c) => c.id === selectedChapterId);
      if (ch?.content) {
        try {
          const parsed = typeof ch.content === "string" ? JSON.parse(ch.content) : ch.content;
          const text = extractText(parsed);
          setSessionStartWords(text.trim().split(/\s+/).filter(Boolean).length);
        } catch {
          setSessionStartWords(0);
        }
      } else {
        setSessionStartWords(0);
      }
    }
  }, [selectedChapterId, chapters, sessionStartWords]);

  const sessionWords = sessionStartWords !== null ? Math.max(0, wordCount - sessionStartWords) : 0;

  const handleAutoSave = useCallback(async (chapterId: string, jsonContent: Record<string, unknown>) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setIsSaving(true);
    const supabase = createClient();
    const contentString = JSON.stringify(jsonContent);
    const { error } = await supabase.from("chapters").update({ content: contentString }).eq("id", chapterId);
    savingRef.current = false;
    setIsSaving(false);
    if (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("[autosave failed]", error);
      }
      return;
    }
    setChapters((prev) => prev.map((ch) => (ch.id === chapterId ? { ...ch, content: contentString } : ch)));
    setLastSaved(new Date());
  }, []);

  const handleCreateChapter = async () => {
    setIsCreating(true);
    const supabase = createClient();
    let targetVersionId = activeVersion?.id ?? null;
    let targetVersionLanguage = activeVersion?.language_code ?? null;
    if (!targetVersionId) {
      const fallbackLanguage = normalizeLanguage(book.original_language ?? book.language);
      const { data: createdVersion, error: versionError } = await supabase
        .from("book_versions")
        .insert({
          book_id: book.id,
          language_code: fallbackLanguage,
          status: "draft",
        })
        .select("id, language_code")
        .single();
      if (versionError || !createdVersion?.id) {
        setIsCreating(false);
        alert("Kunde inte skapa en version för boken. Kontrollera databasen och försök igen.");
        return;
      }
      targetVersionId = createdVersion.id;
      targetVersionLanguage = createdVersion.language_code ?? fallbackLanguage;
      await supabase
        .from("chapters")
        .update({ book_version_id: targetVersionId })
        .eq("book_id", book.id)
        .is("book_version_id", null);
      router.push(`/author/books/${book.id}?lang=${normalizeLangKey(targetVersionLanguage)}`);
    }
    const maxOrder = chapters.length > 0 ? Math.max(...chapters.map((ch) => ch.order)) : 0;
    const { data, error } = await supabase
      .from("chapters")
      .insert({
        book_id: book.id,
        book_version_id: targetVersionId,
        title: `Chapter ${maxOrder + 1}`,
        content: "",
        order: maxOrder + 1,
      })
      .select("id, title, content, order, book_version_id")
      .single();
    setIsCreating(false);
    if (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("[createChapter failed]", error);
      }
      alert(`Failed to create chapter: ${error.message || "Unknown error"}`);
      return;
    }
    if (data) {
      setChapters([...chapters, data]);
      setSelectedChapterId(data.id);
      setSessionStartWords(0);
      router.refresh();
    }
  };

  const handleStartEditTitle = (chapterId: string, currentTitle: string) => {
    setEditingTitleId(chapterId);
    setTempTitle(currentTitle);
  };

  const handleSaveTitle = async (chapterId: string) => {
    if (!tempTitle.trim()) {
      setEditingTitleId(null);
      return;
    }
    setIsSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from("chapters").update({ title: tempTitle.trim() }).eq("id", chapterId);
    setIsSaving(false);
    if (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("[updateChapterTitle failed]", error);
      }
      setEditingTitleId(null);
      return;
    }
    setChapters(chapters.map((ch) => (ch.id === chapterId ? { ...ch, title: tempTitle.trim() } : ch)));
    setEditingTitleId(null);
    router.refresh();
  };

  const handleCancelEditTitle = () => {
    setEditingTitleId(null);
    setTempTitle("");
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && focusMode) {
        e.preventDefault();
        setFocusMode(false);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "f") {
        e.preventDefault();
        setFocusMode((f) => !f);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [focusMode]);

  const commands = [
    { id: "focus", label: "Toggle focus mode", shortcut: "⌘⇧F", run: () => setFocusMode((f) => !f) },
    { id: "new-chapter", label: "New chapter", run: handleCreateChapter },
    { id: "preset-novel", label: "Preset: Novel", run: () => setPreset("novel") },
    { id: "preset-essay", label: "Preset: Essay", run: () => setPreset("essay") },
    { id: "preset-screenplay", label: "Preset: Screenplay", run: () => setPreset("screenplay") },
  ];

  if (focusMode) {
    return (
      <>
        {/* z-[10001] so focus overlay is above navbar (z-9999) */}
        <div className="fixed inset-0 z-[10001] flex flex-col bg-background">
          <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-200/80 bg-white px-4 py-3 dark:border-white/10 dark:bg-slate-900">
            <span className="text-sm text-slate-500 dark:text-white/50">
              Focus mode — Esc or ⌘⇧F to exit
            </span>
            <div className="flex items-center gap-4">
              <span className="text-xs text-slate-500">{wordCount.toLocaleString()} words</span>
              {sessionWords > 0 && (
                <span className="text-xs text-emerald-600 dark:text-emerald-400">+{sessionWords} this session</span>
              )}
              <button
                onClick={() => setFocusMode(false)}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-white/90"
              >
                Exit focus
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-6">
            {selectedChapter ? (
              <div className="mx-auto max-w-3xl">
                <TiptapEditor
                  key={selectedChapter.id}
                  content={selectedChapter.content}
                  onUpdate={(json) => handleAutoSave(selectedChapter.id, json)}
                  placeholder="Start writing..."
                  bookId={book.id}
                  chapterId={selectedChapter.id}
                  preset={preset}
                  onWordCount={setWordCount}
                />
              </div>
            ) : (
              <div className="flex h-full items-center justify-center">
                <p className="text-slate-500">Exit focus mode to select a chapter</p>
              </div>
            )}
          </div>
        </div>
        <CommandPalette open={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} commands={commands} />
      </>
    );
  }

  return (
    <>
      {publishToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed right-6 top-24 z-[1000] rounded-lg bg-slate-900 px-4 py-2 text-[13px] font-medium text-white dark:bg-white dark:text-slate-900"
        >
          {publishToast}
        </div>
      )}
      <section className="mx-auto max-w-[1400px] px-6 py-12">
        {getTranslationsEnabled() && bookVersions.length > 1 && (
          <div className="mb-4 max-w-[320px]">
            <label htmlFor="version-select" className="mb-1 block text-xs text-slate-500 dark:text-white/50">
              Version
            </label>
            <select
              id="version-select"
              value={normalizeLangKey(activeVersion?.language_code ?? activeLanguage)}
              onChange={(e) => router.push(`/author/books/${book.id}?lang=${e.target.value}`)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none dark:border-white/20 dark:bg-white/10 dark:text-white"
            >
              {bookVersions.map((v) => {
                const langKey = normalizeLangKey(v.language_code);
                const isOriginal = normalizeLangKey(book.original_language ?? book.language) === langKey;
                const label = isOriginal ? "Original" : getLanguageLabel(langKey || "unknown");
                return (
                  <option key={v.id} value={langKey}>
                    {label}
                  </option>
                );
              })}
            </select>
          </div>
        )}
        <div className="mb-6 flex flex-wrap items-center gap-2 text-xs">
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              isPublished
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-white/70"
            }`}
          >
            {isPublished ? "Published" : "Draft"}
          </span>
          {isPublished && (
            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-white/70">
              {currentVisibilityLabel}
            </span>
          )}
          <span className="text-slate-500 dark:text-white/50">
            Version: {getLanguageLabel(activeLanguage)}
          </span>
        </div>
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            {!isRenamingBook ? (
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-4xl font-semibold tracking-tight text-slate-900 dark:text-white">
                  {bookTitle}
                </h1>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    isPublished
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                      : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-white/70"
                  }`}
                >
                  {isPublished ? "Published" : "Draft"}
                </span>
                {isPublished && (
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-white/70">
                    {currentVisibilityLabel}
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleStartRenameBook}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-white/70"
                >
                  Rename
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={bookTitleDraft}
                    onChange={(e) => setBookTitleDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveRenameBook();
                      if (e.key === "Escape") handleCancelRenameBook();
                    }}
                    className="min-w-[260px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-slate-500 focus:outline-none dark:border-white/20 dark:bg-white/10 dark:text-white"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={handleSaveRenameBook}
                    disabled={bookTitleSaving}
                    className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-white dark:text-slate-900"
                  >
                    {bookTitleSaving ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelRenameBook}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-white/20 dark:text-white/70 dark:hover:bg-white/5"
                  >
                    Cancel
                  </button>
                </div>
                {bookTitleError && (
                  <p className="text-xs text-red-600 dark:text-red-400">{bookTitleError}</p>
                )}
              </div>
            )}
            <p className="mt-2 text-sm text-slate-600 dark:text-white/60">
              {isPublished ? currentVisibilitySummary : "Draft — not visible to readers yet"} • {chapters.length} chapter{chapters.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <DeleteBookButton
              bookId={book.id}
              bookTitle={bookTitle}
              redirectTo="/author/books"
              className="rounded-full border border-red-200 bg-white px-5 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50 dark:border-red-900/50 dark:bg-white/10 dark:text-red-200 dark:hover:bg-red-950/30"
            />
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
          <div className="space-y-5">
            <div
              id="publish-panel"
              ref={publishPanelRef}
              className={`rounded-xl border border-slate-200 bg-slate-50/50 p-5 transition-shadow dark:border-white/10 dark:bg-white/5 ${
                publishPanelHighlight ? "ring-2 ring-emerald-300/70 shadow-[0_0_0_3px_rgba(16,185,129,0.15)]" : ""
              }`}
            >
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">Publish</h2>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    isPublished
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                      : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-white/70"
                  }`}
                >
                  {isPublished ? "Published" : "Draft"}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-white/50">
                Publish settings for this version. Drafts stay private until you publish.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-white/50">
                <span>{isPublished ? currentVisibilitySummary : "Not visible to readers yet."}</span>
                {isPublished && (
                  <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-white/70">
                    {currentVisibilityLabel}
                  </span>
                )}
              </div>

              <fieldset className="mt-4 space-y-2">
                <legend className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-white/50">
                  Visibility
                </legend>
                {PUBLISH_VISIBILITY_OPTIONS.map((option) => {
                  const selected = publishVisibility === option.value;
                  return (
                    <label
                      key={option.value}
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 transition ${
                        selected
                          ? "border-emerald-300 bg-emerald-50/60 dark:border-emerald-500/50 dark:bg-emerald-500/10"
                          : "border-slate-200 bg-white/70 hover:bg-white dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                      }`}
                    >
                      <input
                        type="radio"
                        name="publish-visibility"
                        value={option.value}
                        checked={selected}
                        onChange={() => {
                          setPublishVisibility(option.value);
                          setPublishError(null);
                        }}
                        className="mt-1 h-4 w-4 accent-emerald-600"
                      />
                      <div>
                        <p className="text-sm font-medium text-slate-900 dark:text-white">{option.label}</p>
                        <p className="text-xs text-slate-500 dark:text-white/50">{option.description}</p>
                      </div>
                    </label>
                  );
                })}
              </fieldset>

              {!isPublished && missingPublishRequirements.length > 0 && (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
                  <p className="mb-2 font-semibold">Before you can publish</p>
                  <ul className="list-disc pl-4">
                    {missingPublishRequirements.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {publishError && (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
                  {publishError}
                </div>
              )}

              {confirmPublishAction && confirmCopy ? (
                <div className="mt-4 rounded-lg border border-slate-200 bg-white px-3 py-3 text-xs text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-white/70">
                  <p className="mb-1 font-semibold text-slate-900 dark:text-white">Confirm</p>
                  <p className="text-xs text-slate-600 dark:text-white/60">{confirmCopy}</p>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => handlePublishAction(confirmPublishAction)}
                      disabled={isPublishing}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {isPublishing ? "Working..." : "Confirm"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmPublishAction(null)}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/20 dark:text-white/70 dark:hover:bg-white/5"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 flex flex-col gap-2">
                  {!isPublished && (
                    <button
                      type="button"
                      onClick={() => setConfirmPublishAction("publish")}
                      disabled={publishDisabled}
                      className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isPublishing ? "Publishing..." : "Publish"}
                    </button>
                  )}
                  {isPublished && (
                    <>
                      <button
                        type="button"
                        onClick={() => setConfirmPublishAction("update")}
                        disabled={isPublishing || !visibilityChanged}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
                      >
                        {isPublishing ? "Updating..." : "Update publish settings"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmPublishAction("unpublish")}
                        disabled={isPublishing}
                        className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900/50 dark:bg-white/10 dark:text-red-200 dark:hover:bg-red-950/30"
                      >
                        Unpublish
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5 dark:border-white/10 dark:bg-white/5">
              <h2 className="mb-3 text-base font-semibold text-slate-900 dark:text-white">Cover</h2>
              <div className="space-y-2">
                <div className="aspect-[3/4] overflow-hidden rounded-lg border border-slate-200 bg-slate-100 dark:border-white/10 dark:bg-white/5">
                  {displayCoverUrl ? (
                    <img
                      src={displayCoverUrl}
                      alt="Book cover"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-sm text-slate-500 dark:text-white/50">
                      No cover
                    </div>
                  )}
                </div>
                <input
                  ref={coverInputRef}
                  type="file"
                  accept={ACCEPTED_COVER_TYPES}
                  onChange={handleCoverChange}
                  className="hidden"
                  aria-hidden
                />
                <button
                  type="button"
                  onClick={() => coverInputRef.current?.click()}
                  disabled={coverUploading}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
                >
                  {coverUploading ? "Uploading…" : "Upload cover"}
                </button>
                {coverError && (
                  <p className="text-xs text-red-600 dark:text-red-400" role="alert">
                    {coverError}
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5 dark:border-white/10 dark:bg-white/5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">Chapters</h2>
              <button
                onClick={handleCreateChapter}
                disabled={isCreating}
                className="rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-900"
              >
                {isCreating ? "..." : "+ New"}
              </button>
            </div>

            {chapters.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-white/50">No chapters yet. Create one to get started.</p>
            ) : (
              <ul className="space-y-1">
                {chapters.map((chapter) => (
                  <li key={chapter.id}>
                    {editingTitleId === chapter.id ? (
                      <div className="flex flex-col gap-2">
                        <input
                          type="text"
                          value={tempTitle}
                          onChange={(e) => setTempTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSaveTitle(chapter.id);
                            if (e.key === "Escape") handleCancelEditTitle();
                          }}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none dark:border-white/20 dark:bg-white/10 dark:text-white"
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleSaveTitle(chapter.id)}
                            className="flex-1 rounded-lg bg-slate-900 px-2 py-1 text-xs text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900"
                          >
                            Save
                          </button>
                          <button
                            onClick={handleCancelEditTitle}
                            className="flex-1 rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 dark:border-white/20 dark:text-white/70 dark:hover:bg-white/5"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setSelectedChapterId(chapter.id);
                          setSessionStartWords(null);
                        }}
                        onDoubleClick={() => handleStartEditTitle(chapter.id, chapter.title)}
                        className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                          selectedChapterId === chapter.id
                            ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                            : "text-slate-700 hover:bg-slate-100 dark:text-white/70 dark:hover:bg-white/5"
                        }`}
                      >
                        <span className="block truncate font-medium">{chapter.title}</span>
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-slate-500 dark:text-white/50">Double-click to rename</p>
            </div>

            {getTranslationsEnabled() && (
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5 dark:border-white/10 dark:bg-white/5">
                <h2 className="mb-3 text-base font-semibold text-slate-900 dark:text-white">Translation</h2>
                <p className="mb-3 text-xs text-slate-500 dark:text-white/50">
                  Create a new language version of this book. The translation will appear when ready.
                </p>
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-500 dark:text-white/50">Status:</span>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      translationUiStatus === "translating"
                        ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200"
                        : translationUiStatus === "done"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200"
                          : translationUiStatus === "error"
                            ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200"
                            : "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
                    }`}
                    role="status"
                  >
                    {translationUiStatus === "idle" && "Idle"}
                    {translationUiStatus === "translating" && "Translating…"}
                    {translationUiStatus === "done" && "Done"}
                    {translationUiStatus === "error" && "Error"}
                  </span>
                </div>
                <label htmlFor="translate-language" className="mb-1 block text-xs text-slate-500 dark:text-white/50">Target language</label>
                <select
                  id="translate-language"
                  value={translateTargetLanguage}
                  onChange={(e) => setTranslateTargetLanguage(e.target.value as SupportedLanguage)}
                  className="mb-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none dark:border-white/20 dark:bg-white/10 dark:text-white"
                >
                  {LANGUAGE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleStartTranslation}
                  disabled={isStartingTranslation}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
                >
                  {isStartingTranslation ? "Startar…" : "Start translation"}
                </button>
                {currentTargetVersion && (
                  <button
                    type="button"
                    onClick={() =>
                      router.push(`/author/books/${book.id}?lang=${normalizeLangKey(currentTargetVersion.language_code)}`)
                    }
                    className="mt-2 w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-white/90"
                  >
                    Open version
                  </button>
                )}
                {translateMessage && (
                  <div
                    className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
                      translationUiStatus === "done" || translateMessage.toLowerCase().includes("klar")
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200"
                        : translationUiStatus === "error"
                          ? "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200"
                          : "border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-200"
                    }`}
                    role="status"
                  >
                    {translateMessage}
                  </div>
                )}
              </div>
            )}

            <div id="tts" className="rounded-xl border border-slate-200 bg-slate-50/50 p-5 dark:border-white/10 dark:bg-white/5">
              <h2 className="mb-3 text-base font-semibold text-slate-900 dark:text-white">Text to Speech</h2>
              <p className="mb-3 text-xs text-slate-500 dark:text-white/50">
                Generate audio from this book&apos;s first chapter. Uses the default TTS voice (Piper).
              </p>
              <div className="mb-3 flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500 dark:text-white/50">Status:</span>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    ttsStatus === "generating" || ttsStatus === "uploading"
                      ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200"
                      : ttsStatus === "done"
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200"
                        : ttsStatus === "error"
                          ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200"
                          : "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
                  }`}
                  role="status"
                >
                  {ttsStatus === "idle" && "Idle"}
                  {ttsStatus === "generating" && "Generating…"}
                  {ttsStatus === "uploading" && "Uploading…"}
                  {ttsStatus === "done" && "Done"}
                  {ttsStatus === "error" && "Error"}
                </span>
              </div>
              <label htmlFor="tts-voice" className="mb-1 block text-xs text-slate-500 dark:text-white/50">Voice</label>
              <select
                id="tts-voice"
                value={ttsVoice}
                onChange={(e) => setTtsVoice(e.target.value)}
                className="mb-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none dark:border-white/20 dark:bg-white/10 dark:text-white"
              >
                <option value="default">Default (sv_SE-nst-medium)</option>
              </select>
              <button
                type="button"
                onClick={handleStartTts}
                disabled={ttsStatus === "generating" || ttsStatus === "uploading"}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
              >
                {ttsStatus === "generating" || ttsStatus === "uploading"
                  ? ttsStatus === "uploading"
                    ? "Uploading…"
                    : "Generating…"
                  : "Start TTS"}
              </button>
              {(ttsAudioUrl ?? latestAudiobookAsset?.audio_url) && (
                <div className="mt-3 space-y-2">
                  <audio
                    src={ttsAudioUrl ?? latestAudiobookAsset?.audio_url ?? undefined}
                    controls
                    className="w-full"
                    preload="metadata"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        const url = ttsAudioUrl ?? latestAudiobookAsset?.audio_url ?? "";
                        if (url) {
                          try {
                            await navigator.clipboard.writeText(url);
                            setTtsMessage("URL kopierad.");
                            setTimeout(() => setTtsMessage(null), 2000);
                          } catch {
                            setTtsMessage("Kunde inte kopiera.");
                          }
                        }
                      }}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
                    >
                      Copy audio URL
                    </button>
                    <a
                      href={ttsAudioUrl ?? latestAudiobookAsset?.audio_url ?? "#"}
                      download="audiobook-sample.wav"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
                    >
                      Download
                    </a>
                  </div>
                </div>
              )}
              {ttsMessage && (
                <div
                  className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
                    ttsStatus === "done" || ttsMessage.includes("genererat") || ttsMessage.includes("kopierad")
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200"
                      : ttsStatus === "error"
                        ? "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200"
                        : "border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-200"
                  }`}
                  role="status"
                >
                  {ttsMessage}
                </div>
              )}
              {ttsManualSteps && ttsStatus === "error" && (
                <div
                  className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
                  role="alert"
                >
                  <p className="mb-1 font-medium">Åtgärd krävs:</p>
                  <p className="whitespace-pre-wrap">{ttsManualSteps}</p>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5 dark:border-white/10 dark:bg-white/5">
              <h2 className="mb-3 text-base font-semibold text-slate-900 dark:text-white">Original</h2>
              <label htmlFor="original-url-editor" className="mb-1 block text-xs text-slate-500 dark:text-white/50">Original available on Amazon</label>
              <input
                id="original-url-editor"
                type="url"
                value={originalUrl}
                onChange={(e) => setOriginalUrl(e.target.value)}
                onBlur={handleOriginalUrlBlur}
                placeholder="https://..."
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none dark:border-white/20 dark:bg-white/10 dark:text-white dark:placeholder:text-white/40"
              />
            </div>

            {getAudiobookEnabled() && (
            <div id="audiobook" className="rounded-xl border border-slate-200 bg-slate-50/50 p-5 dark:border-white/10 dark:bg-white/5">
              <h2 className="mb-2 text-base font-semibold text-slate-900 dark:text-white">Audiobook</h2>
              <div className="mb-2 flex items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    book.audiobook_status === "published"
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
                      : book.audiobook_status === "generating"
                        ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                        : book.audiobook_status === "failed"
                          ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                          : "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
                  }`}
                >
                  {book.audiobook_status ?? "not_started"}
                </span>
              </div>
              <button
                type="button"
                onClick={handleGenerateAudiobook}
                disabled={isGeneratingAudiobook}
                className="mb-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
              >
                {isGeneratingAudiobook ? "Generating…" : "Generate audiobook"}
              </button>
              {latestAudiobookAsset?.audio_url && (
                <p className="mb-1 text-xs text-slate-500 dark:text-white/50">Asset: {latestAudiobookAsset.audio_url}</p>
              )}
              {book.audiobook_status === "failed" && (
                <p className="text-xs text-red-600 dark:text-red-400" role="alert">
                  {audiobookError ?? "Generation failed."}
                </p>
              )}
            </div>
            )}

            {getMarketingEnabled() && (
            <div id="marketing" className="rounded-xl border border-slate-200 bg-slate-50/50 p-5 dark:border-white/10 dark:bg-white/5">
              <h2 className="mb-3 text-base font-semibold text-slate-900 dark:text-white">Marketing</h2>
              <div className="mb-3 flex flex-wrap gap-2">
                <div className="flex flex-col gap-1">
                  <label htmlFor="marketing-channel" className="text-xs text-slate-500 dark:text-white/50">Channel</label>
                  <select
                    id="marketing-channel"
                    value={marketingChannel}
                    onChange={(e) => setMarketingChannel(e.target.value as MarketingChannel)}
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 focus:border-slate-500 focus:outline-none dark:border-white/20 dark:bg-white/10 dark:text-white"
                  >
                    {MARKETING_CHANNELS.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="marketing-language" className="text-xs text-slate-500 dark:text-white/50">Language</label>
                  <select
                    id="marketing-language"
                    value={marketingLanguage}
                    onChange={(e) => setMarketingLanguage(e.target.value as SupportedLanguage)}
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 focus:border-slate-500 focus:outline-none dark:border-white/20 dark:bg-white/10 dark:text-white"
                  >
                    {LANGUAGE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              {currentCampaign && (
                <div className="mb-2 flex items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      currentCampaign.status === "generated" || currentCampaign.status === "published"
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
                        : "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
                    }`}
                  >
                    {currentCampaign.status}
                  </span>
                </div>
              )}
              <button
                type="button"
                onClick={handleGenerateMarketingCopy}
                disabled={isGeneratingMarketing}
                className="mb-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
              >
                {isGeneratingMarketing ? "Generating…" : "Generate launch copy"}
              </button>
              {currentCampaign && (
                <div className="space-y-2">
                  {currentCampaign.headline && (
                    <p className="text-xs font-medium text-slate-500 dark:text-white/50">Headline</p>
                  )}
                  {currentCampaign.headline && (
                    <p className="whitespace-pre-wrap break-words rounded border border-slate-200 bg-white p-2 text-xs text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-white/90">
                      {currentCampaign.headline}
                    </p>
                  )}
                  {currentCampaign.caption && (
                    <>
                      <p className="text-xs font-medium text-slate-500 dark:text-white/50">Caption</p>
                      <p className="whitespace-pre-wrap break-words rounded border border-slate-200 bg-white p-2 text-xs text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-white/90">
                        {currentCampaign.caption}
                      </p>
                    </>
                  )}
                  {currentCampaign.cta && (
                    <>
                      <p className="text-xs font-medium text-slate-500 dark:text-white/50">CTA</p>
                      <p className="rounded border border-slate-200 bg-white p-2 text-xs text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-white/90">
                        {currentCampaign.cta}
                      </p>
                    </>
                  )}
                  {currentCampaign.hashtags && (
                    <>
                      <p className="text-xs font-medium text-slate-500 dark:text-white/50">Hashtags</p>
                      <p className="rounded border border-slate-200 bg-white p-2 text-xs text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-white/90">
                        {currentCampaign.hashtags}
                      </p>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={handleCopyMarketingToClipboard}
                    className="w-full rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-white/90"
                  >
                    {marketingCopyFeedback ? "Copied!" : "Copy to clipboard"}
                  </button>
                </div>
              )}
              <p className="mt-3 text-xs text-slate-500 dark:text-white/50">Reader URL</p>
              <a
                href={`/reader/books/${book.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 block truncate text-xs text-emerald-600 underline dark:text-emerald-400"
              >
                /reader/books/{book.id}
              </a>
            </div>
            )}
          </div>

          <div>
            {selectedChapter ? (
              <>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-slate-900 dark:text-white">{selectedChapter.title}</h2>
                  <div className="flex items-center gap-3">
                    <p className="text-xs text-slate-500 dark:text-white/50">
                      {isSaving ? (
                        <span className="flex items-center gap-1">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
                          Saving...
                        </span>
                      ) : lastSaved ? (
                        <span className="text-green-600 dark:text-green-400">
                          Last saved {lastSaved.toLocaleTimeString()}
                        </span>
                      ) : (
                        "Autosave on"
                      )}
                    </p>
                    <button
                      onClick={() => handleStartEditTitle(selectedChapter.id, selectedChapter.title)}
                      className="text-xs text-slate-500 hover:text-slate-900 dark:text-white/50 dark:hover:text-white"
                    >
                      Rename
                    </button>
                  </div>
                </div>

                <AuthorStatsBar
                  wordCount={wordCount}
                  sessionWords={sessionWords}
                  onFocusToggle={() => setFocusMode(true)}
                  focusMode={false}
                  preset={preset}
                  onPresetChange={setPreset}
                  onNewChapter={handleCreateChapter}
                  onCommandPalette={() => setCommandPaletteOpen(true)}
                />

                <div className="mt-3">
                  <TiptapEditor
                    key={selectedChapter.id}
                    content={selectedChapter.content}
                    onUpdate={(json) => handleAutoSave(selectedChapter.id, json)}
                    placeholder="Start writing your chapter..."
                    bookId={book.id}
                    chapterId={selectedChapter.id}
                    preset={preset}
                    onWordCount={setWordCount}
                  />
                </div>
              </>
            ) : (
              <div className="flex h-[500px] items-center justify-center rounded-xl border border-slate-200 bg-slate-50/50 dark:border-white/10 dark:bg-white/5">
                <p className="text-slate-500 dark:text-white/50">
                  {chapters.length === 0 ? "Create your first chapter to start writing" : "Select a chapter from the sidebar"}
                </p>
              </div>
            )}
          </div>
        </div>
      </section>
      <CommandPalette open={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} commands={commands} />
    </>
  );
}
