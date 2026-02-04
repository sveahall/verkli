"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { uploadBookCover } from "@/lib/supabase/storage";
import TiptapEditor from "@/components/editor/TiptapEditor";
import AuthorStatsBar from "@/components/editor/AuthorStatsBar";
import CommandPalette from "@/components/editor/CommandPalette";
import DeleteBookButton from "@/components/books/DeleteBookButton";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import { getAudiobookEnabled, getMarketingEnabled, getTranslationsEnabled } from "@/lib/flags";
import {
  getLanguageLabel,
  LANGUAGE_OPTIONS,
  normalizeLanguage,
  normalizeLanguageOrNull,
  type SupportedLanguage,
} from "@/lib/languages";

const ACCEPTED_COVER_TYPES = "image/*";

const STORAGE_PRESET = "verkli_editor_preset";

type Chapter = {
  id: string;
  title: string;
  content: string | null;
  order: number;
  book_version_id: string;
};

function normalizeLangKey(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
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
  language_code: string | null;
  status: string;
  published_at?: string | null;
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
  const [activeView, setActiveView] = useState("editor");
  const [isPublishing, setIsPublishing] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
  const [originalUrl, setOriginalUrl] = useState(book.original_url ?? "");
  const [marketingChannel, setMarketingChannel] = useState<MarketingChannel>("generic");
  const [marketingLanguage, setMarketingLanguage] = useState<SupportedLanguage>(
    normalizeLanguage(activeVersion?.language_code ?? book.original_language ?? book.language)
  );
  const resolvedSourceLanguage = useMemo<SupportedLanguage | null>(
    () =>
      normalizeLanguageOrNull(activeVersion?.language_code) ??
      normalizeLanguageOrNull(book.original_language) ??
      normalizeLanguageOrNull(book.language),
    [activeVersion?.language_code, book.original_language, book.language]
  );
  const [sourceLanguageDraft, setSourceLanguageDraft] = useState<SupportedLanguage | "">(
    resolvedSourceLanguage ?? ""
  );
  const [isSavingSourceLanguage, setIsSavingSourceLanguage] = useState(false);
  const [sourceLanguageError, setSourceLanguageError] = useState<string | null>(null);
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
  const translationsEnabled = getTranslationsEnabled();
  const audiobookEnabled = getAudiobookEnabled();
  const marketingEnabled = getMarketingEnabled();
  const savingRef = useRef(false);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const viewTabs = useMemo<TabItem[]>(() => {
    const tabs: TabItem[] = [
      { id: "editor", label: "Editor" },
      { id: "details", label: "Details" },
    ];
    if (translationsEnabled) tabs.push({ id: "translation", label: "Translate" });
    if (audiobookEnabled) tabs.push({ id: "audio", label: "Audio" });
    if (marketingEnabled) tabs.push({ id: "marketing", label: "Marketing" });
    return tabs;
  }, [translationsEnabled, audiobookEnabled, marketingEnabled]);

  useEffect(() => {
    setChapters(initialChapters);
    setSelectedChapterId(initialChapters[0]?.id ?? null);
  }, [initialChapters]);

  useEffect(() => {
    setSourceLanguageDraft(resolvedSourceLanguage ?? "");
    setSourceLanguageError(null);
  }, [resolvedSourceLanguage]);

  const selectedChapter = chapters.find((ch) => ch.id === selectedChapterId);
  const displayCoverUrl = coverPreviewUrl ?? book.cover_image;

  const handleViewChange = useCallback((nextView: string) => {
    setActiveView(nextView);
    const section = document.getElementById(nextView);
    if (section) {
      section.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  const activeLanguage = normalizeLanguageOrNull(
    activeVersion?.language_code ?? book.original_language ?? book.language
  );

  const languageTabs = useMemo<TabItem[]>(() => {
    return bookVersions.map((version) => {
      const langKey = normalizeLangKey(version.language_code);
      const isOriginal = normalizeLangKey(book.original_language ?? book.language) === langKey;
      return {
        id: langKey || version.id,
        label: isOriginal ? "Original" : getLanguageLabel(langKey || "unknown"),
        badge: version.published_at ? "Published" : "Draft",
      };
    });
  }, [bookVersions, book.original_language, book.language]);

  const activeLanguageKey =
    normalizeLangKey(activeVersion?.language_code ?? activeLanguage) || languageTabs[0]?.id || "";

  const headerDescription = `${activeVersion?.published_at ? "Published" : "Draft"} • ${chapters.length} chapter${
    chapters.length !== 1 ? "s" : ""
  }`;

  const titleNode = bookTitle;

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

  const sourceLanguageKnown = Boolean(resolvedSourceLanguage);
  const isTargetSameAsSource =
    sourceLanguageKnown &&
    normalizeLangKey(translateTargetLanguage) === normalizeLangKey(resolvedSourceLanguage);
  const canStartTranslation =
    Boolean(activeVersion?.id) &&
    sourceLanguageKnown &&
    !isTargetSameAsSource &&
    !isStartingTranslation &&
    !isSavingSourceLanguage &&
    translationUiStatus !== "translating";

  const translateActionLabel = currentTargetVersion ? "Re-translate" : "Start translation";
  const translateLoadingLabel = currentTargetVersion ? "Retranslating" : "Starting";

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

  const handleSourceLanguageChange = useCallback(
    async (nextLanguage: SupportedLanguage) => {
      if (isSavingSourceLanguage) return;
      if (!activeVersion?.id) {
        setSourceLanguageError("Ingen aktiv version hittades.");
        return;
      }
      setSourceLanguageDraft(nextLanguage);
      setSourceLanguageError(null);
      setIsSavingSourceLanguage(true);
      try {
        const supabase = createClient();
        const { error: versionError } = await supabase
          .from("book_versions")
          .update({ language_code: nextLanguage })
          .eq("id", activeVersion.id);
        if (versionError) {
          setSourceLanguageError("Kunde inte spara källspråk. Försök igen.");
          setSourceLanguageDraft(resolvedSourceLanguage ?? "");
          return;
        }

        const bookOriginalKnown = normalizeLanguageOrNull(book.original_language);
        const bookLanguageKnown = normalizeLanguageOrNull(book.language);
        const updatePayload: { original_language?: string; language?: string } = {};
        if (!bookOriginalKnown) updatePayload.original_language = nextLanguage;
        if (!bookLanguageKnown) updatePayload.language = nextLanguage;
        if (Object.keys(updatePayload).length > 0) {
          await supabase.from("books").update(updatePayload).eq("id", book.id);
        }

        setTranslateMessage("Källspråk uppdaterat.");
        router.refresh();
      } catch (err) {
        setSourceLanguageError(err instanceof Error ? err.message : "Kunde inte spara källspråk.");
        setSourceLanguageDraft(resolvedSourceLanguage ?? "");
      } finally {
        setIsSavingSourceLanguage(false);
      }
    },
    [
      activeVersion?.id,
      book.id,
      book.language,
      book.original_language,
      isSavingSourceLanguage,
      resolvedSourceLanguage,
      router,
    ]
  );

  const handleStartTranslation = useCallback(async () => {
    if (isStartingTranslation) return;
    setIsStartingTranslation(true);
    setTranslateMessage(null);

    if (!sourceLanguageKnown) {
      setTranslateMessage("Källspråk saknas för den här versionen. Välj källspråk och försök igen.");
      setIsStartingTranslation(false);
      return;
    }

    if (isTargetSameAsSource) {
      setTranslateMessage("Målspråket måste skilja sig från källspråket.");
      setIsStartingTranslation(false);
      return;
    }

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
        if (data?.existingVersionId) {
          setTranslateMessage("Version finns redan. Öppnar befintlig version…");
          router.push(`/author/books/${book.id}?lang=${normalizeLangKey(translateTargetLanguage)}`);
          return;
        }
        const errMsg = data?.error ?? "Failed to start translation";
        const lowered = String(errMsg).toLowerCase();
        if (res.status === 422 || data?.code === "SOURCE_LANGUAGE_MISSING") {
          setTranslateMessage("Källspråk saknas för den här versionen. Välj källspråk och försök igen.");
          return;
        }
        if (lowered.includes("target language must be different")) {
          setTranslateMessage("Målspråket måste skilja sig från källspråket.");
          return;
        }
        if (lowered.includes("valid target language")) {
          setTranslateMessage("Välj ett giltigt målspråk.");
          return;
        }
        if (lowered.includes("no source version")) {
          setTranslateMessage("Ingen källversion hittades.");
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
    sourceLanguageKnown,
    isTargetSameAsSource,
  ]);

  const handlePublish = async () => {
    if (isPublishing || !activeVersion?.id) return;
    setIsPublishing(true);
    try {
      const res = await fetch(`/api/books/${book.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: activeVersion.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to publish");
        return;
      }
      router.refresh();
    } catch (err) {
      if (process.env.NODE_ENV === "development") {
        console.error("[publish failed]", err);
      }
      alert("Failed to publish");
    } finally {
      setIsPublishing(false);
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

  const headerActions = (
    <div className="flex flex-wrap items-center gap-3">
      {!isRenamingBook && (
        <Button variant="ghost" size="sm" onClick={handleStartRenameBook}>
          Rename
        </Button>
      )}
      {translationsEnabled && (
        <Button variant="secondary" onClick={() => handleViewChange("translation")}>
          Translate
        </Button>
      )}
      {activeVersion && !activeVersion.published_at && (
        <Button
          onClick={handlePublish}
          disabled={isPublishing || chapters.length === 0}
          className="bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400"
        >
          {isPublishing ? "Publishing..." : "Publish version"}
        </Button>
      )}
      <DeleteBookButton
        bookId={book.id}
        bookTitle={bookTitle}
        redirectTo="/author/books"
        className="text-red-600 hover:text-red-700 dark:text-red-300 dark:hover:text-red-200"
      />
    </div>
  );

  const renamePanel = isRenamingBook ? (
    <div className="card-base-subtle p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={bookTitleDraft}
          onChange={(e) => setBookTitleDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSaveRenameBook();
            if (e.key === "Escape") handleCancelRenameBook();
          }}
          className="min-w-[260px]"
          autoFocus
        />
        <Button size="sm" onClick={handleSaveRenameBook} isLoading={bookTitleSaving} loadingText="Saving">
          Save
        </Button>
        <Button size="sm" variant="secondary" onClick={handleCancelRenameBook}>
          Cancel
        </Button>
      </div>
      {bookTitleError && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{bookTitleError}</p>}
    </div>
  ) : null;

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
      const fallbackLanguage =
        normalizeLanguageOrNull(book.original_language ?? book.language) ?? "und";
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
      <div className="page-content py-10">
        <div className="section-gap">
          <Breadcrumbs
            items={[{ label: "Books", href: "/author/books" }, { label: bookTitle || "Untitled" }]}
          />
          <PageHeader title={titleNode} description={headerDescription} actions={headerActions} />
          {renamePanel}

          {translationsEnabled && languageTabs.length > 1 && (
            <Tabs
              items={languageTabs}
              active={activeLanguageKey}
              onChange={(id) => router.push(`/author/books/${book.id}?lang=${id}`)}
            />
          )}

          {viewTabs.length > 1 && (
            <Tabs items={viewTabs} active={activeView} onChange={handleViewChange} />
          )}

          <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
          <div id="details" className="space-y-5">
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
                <Button
                  type="button"
                  onClick={() => coverInputRef.current?.click()}
                  disabled={coverUploading}
                  variant="secondary"
                  fullWidth
                  isLoading={coverUploading}
                  loadingText="Uploading"
                >
                  Upload cover
                </Button>
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
              <Button
                size="sm"
                onClick={handleCreateChapter}
                disabled={isCreating}
                isLoading={isCreating}
                loadingText="Creating"
              >
                New chapter
              </Button>
            </div>

            {chapters.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-white/50">No chapters yet. Create one to get started.</p>
            ) : (
              <ul className="space-y-1">
                {chapters.map((chapter) => (
                  <li key={chapter.id}>
                    {editingTitleId === chapter.id ? (
                      <div className="flex flex-col gap-2">
                        <Input
                          value={tempTitle}
                          onChange={(e) => setTempTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSaveTitle(chapter.id);
                            if (e.key === "Escape") handleCancelEditTitle();
                          }}
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => handleSaveTitle(chapter.id)} className="flex-1">
                            Save
                          </Button>
                          <Button size="sm" variant="secondary" onClick={handleCancelEditTitle} className="flex-1">
                            Cancel
                          </Button>
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

            {translationsEnabled && (
              <div id="translation" className="rounded-xl border border-slate-200 bg-slate-50/50 p-5 dark:border-white/10 dark:bg-white/5">
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
                <div className="mb-3 space-y-2">
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-white/50">
                    <span className="font-medium">Source:</span>
                    <span className="text-slate-700 dark:text-white/80">
                      {sourceLanguageKnown && resolvedSourceLanguage
                        ? getLanguageLabel(resolvedSourceLanguage)
                        : "Unknown"}
                    </span>
                  </div>
                  {!sourceLanguageKnown && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-100">
                      Källspråk saknas för denna version. Välj källspråk för att kunna översätta.
                    </div>
                  )}
                  <label htmlFor="source-language" className="mb-1 block text-xs text-slate-500 dark:text-white/50">
                    Source language
                  </label>
                  <Select
                    id="source-language"
                    value={sourceLanguageDraft}
                    onChange={(e) => handleSourceLanguageChange(e.target.value as SupportedLanguage)}
                    disabled={isSavingSourceLanguage}
                  >
                    <option value="" disabled>
                      Välj källspråk
                    </option>
                    {LANGUAGE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </Select>
                  {isSavingSourceLanguage && (
                    <p className="text-xs text-slate-500 dark:text-white/50">Sparar källspråk…</p>
                  )}
                  {sourceLanguageError && (
                    <p className="text-xs text-red-600 dark:text-red-400" role="alert">
                      {sourceLanguageError}
                    </p>
                  )}
                </div>
                <label htmlFor="translate-language" className="mb-1 block text-xs text-slate-500 dark:text-white/50">Target language</label>
                <Select
                  id="translate-language"
                  value={translateTargetLanguage}
                  onChange={(e) => setTranslateTargetLanguage(e.target.value as SupportedLanguage)}
                >
                  {LANGUAGE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </Select>
                {isTargetSameAsSource && (
                  <p className="mb-2 text-xs text-amber-700 dark:text-amber-200">
                    Målspråket måste skilja sig från källspråket.
                  </p>
                )}
                <Button
                  type="button"
                  onClick={handleStartTranslation}
                  disabled={!canStartTranslation}
                  variant="secondary"
                  fullWidth
                  isLoading={isStartingTranslation}
                  loadingText={translateLoadingLabel}
                >
                  {translateActionLabel}
                </Button>
                {currentTargetVersion && (
                  <Button
                    type="button"
                    onClick={() =>
                      router.push(`/author/books/${book.id}?lang=${normalizeLangKey(currentTargetVersion.language_code)}`)
                    }
                    className="mt-2"
                    fullWidth
                  >
                    Open version
                  </Button>
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

            <div id="audio" className="rounded-xl border border-slate-200 bg-slate-50/50 p-5 dark:border-white/10 dark:bg-white/5">
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
              <Select
                id="tts-voice"
                value={ttsVoice}
                onChange={(e) => setTtsVoice(e.target.value)}
              >
                <option value="default">Default (sv_SE-nst-medium)</option>
              </Select>
              <Button
                type="button"
                onClick={handleStartTts}
                disabled={ttsStatus === "generating" || ttsStatus === "uploading"}
                variant="secondary"
                fullWidth
                isLoading={ttsStatus === "generating" || ttsStatus === "uploading"}
                loadingText={ttsStatus === "uploading" ? "Uploading" : "Generating"}
              >
                Start TTS
              </Button>
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
              <Input
                id="original-url-editor"
                type="url"
                value={originalUrl}
                onChange={(e) => setOriginalUrl(e.target.value)}
                onBlur={handleOriginalUrlBlur}
                placeholder="https://..."
              />
            </div>

            {audiobookEnabled && (
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
              <Button
                type="button"
                onClick={handleGenerateAudiobook}
                disabled={isGeneratingAudiobook}
                variant="secondary"
                fullWidth
                isLoading={isGeneratingAudiobook}
                loadingText="Generating"
              >
                Generate audiobook
              </Button>
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

            {marketingEnabled && (
            <div id="marketing" className="rounded-xl border border-slate-200 bg-slate-50/50 p-5 dark:border-white/10 dark:bg-white/5">
              <h2 className="mb-3 text-base font-semibold text-slate-900 dark:text-white">Marketing</h2>
              <div className="mb-3 flex flex-wrap gap-2">
                <div className="flex flex-col gap-1">
                  <label htmlFor="marketing-channel" className="text-xs text-slate-500 dark:text-white/50">Channel</label>
                  <Select
                    id="marketing-channel"
                    value={marketingChannel}
                    onChange={(e) => setMarketingChannel(e.target.value as MarketingChannel)}
                  >
                    {MARKETING_CHANNELS.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </Select>
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="marketing-language" className="text-xs text-slate-500 dark:text-white/50">Language</label>
                  <Select
                    id="marketing-language"
                    value={marketingLanguage}
                    onChange={(e) => setMarketingLanguage(e.target.value as SupportedLanguage)}
                  >
                    {LANGUAGE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </Select>
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
                  <Button
                    type="button"
                    onClick={handleCopyMarketingToClipboard}
                    fullWidth
                    size="sm"
                  >
                    {marketingCopyFeedback ? "Copied!" : "Copy to clipboard"}
                  </Button>
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

          <div id="editor" className="space-y-6">
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
                          Saved {lastSaved.toLocaleTimeString()}
                        </span>
                      ) : (
                        "Autosave enabled"
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
      </div>
    </div>
      <CommandPalette open={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} commands={commands} />
    </>
  );
}

function extractText(node: { content?: unknown[]; text?: string }): string {
  if (!node) return "";
  if (node.text) return node.text;
  if (Array.isArray(node.content)) {
    return node.content.map((c) => extractText(c as { content?: unknown[]; text?: string })).join("");
  }
  return "";
}
