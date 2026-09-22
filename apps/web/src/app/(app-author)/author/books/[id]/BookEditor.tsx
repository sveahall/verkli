"use client";

import Link from "next/link";
import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { uploadBookCover } from "@/lib/supabase/storage";
import TiptapEditor from "@/components/editor/TiptapEditor";
import AuthorStatsBar from "@/components/editor/AuthorStatsBar";
import CommandPalette from "@/components/editor/CommandPalette";
import { getAudiobookEnabled, getMarketingEnabled, getTranslationsEnabled } from "@/lib/flags";
import { getLanguageLabel, LANGUAGE_OPTIONS, SUPPORTED_LANGUAGE_CODES, normalizeLanguage, type SupportedLanguage } from "@/lib/languages";

const ACCEPTED_COVER_TYPES = "image/*";

const STORAGE_PRESET = "verkli_editor_preset";

type Chapter = {
  id: string;
  title: string;
  content: string | null;
  order: number;
};

const TRANSLATION_STATUSES = ["draft", "needs_review", "ready", "published"] as const;
type TranslationStatus = (typeof TRANSLATION_STATUSES)[number];

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
  original_source?: string | null;
  original_url?: string | null;
  is_translation?: boolean | null;
  original_book_id?: string | null;
  translation_status?: string | null;
  audiobook_status?: string | null;
};

type LatestAudiobookAsset = {
  id: string;
  audio_url: string | null;
  status: string;
  created_at: string;
} | null;

type Props = {
  groupId: string;
  groupBooks: Book[];
  defaultBookId: string;
  book: Book;
  chapters: Chapter[];
  chaptersByBookId: Record<string, { id: string; title: string; content: string | null; order: number }[]>;
  latestAudiobookAsset?: LatestAudiobookAsset;
  marketingCampaigns?: MarketingCampaignRow[];
};

const ORIGINAL_LANG = "original";

function buildLanguageTabs(groupId: string, groupBooks: Book[]): { langKey: string; label: string; book: Book }[] {
  const original = groupBooks.find((b) => b.id === groupId) ?? groupBooks[0];
  const tabs: { langKey: string; label: string; book: Book }[] = [{ langKey: ORIGINAL_LANG, label: "Original", book: original }];
  groupBooks
    .filter((b) => b.is_translation && b.language)
    .forEach((b) => {
      const code = String(b.language).toLowerCase();
      if (!tabs.some((t) => t.langKey === code)) {
        tabs.push({ langKey: code, label: getLanguageLabel(code), book: b });
      }
    });
  return tabs;
}

export default function BookEditor({
  groupId,
  groupBooks,
  defaultBookId,
  book: initialBook,
  chapters: initialChapters,
  chaptersByBookId,
  latestAudiobookAsset = null,
  marketingCampaigns = [],
}: Props) {
  const router = useRouter();
  const [activeBookId, setActiveBookId] = useState(defaultBookId);
  const activeBook = groupBooks.find((b) => b.id === activeBookId) ?? initialBook;
  const book = activeBook;

  const chaptersForActive = chaptersByBookId[activeBookId] ?? [];
  const [chapters, setChapters] = useState<Chapter[]>(chaptersForActive.length > 0 ? chaptersForActive : initialChapters);
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(
    chapters[0]?.id ?? null
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [tempTitle, setTempTitle] = useState("");
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [preset, setPreset] = useState("novel");
  const [wordCount, setWordCount] = useState(0);
  const [sessionStartWords, setSessionStartWords] = useState<number | null>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
  const [originalUrl, setOriginalUrl] = useState(book.original_url ?? "");
  const [marketingChannel, setMarketingChannel] = useState<MarketingChannel>("generic");
  const [marketingLanguage, setMarketingLanguage] = useState<SupportedLanguage>(normalizeLanguage(book.language));
  const [marketingCopyFeedback, setMarketingCopyFeedback] = useState(false);
  const [isGeneratingMarketing, setIsGeneratingMarketing] = useState(false);
  const [translationStatus, setTranslationStatus] = useState<string>(book.translation_status ?? "draft");
  const [isGeneratingAudiobook, setIsGeneratingAudiobook] = useState(false);
  const [audiobookError, setAudiobookError] = useState<string | null>(null);
  const [editingBookTitle, setEditingBookTitle] = useState(false);
  const [bookTitleValue, setBookTitleValue] = useState("");
  const [translateTargetLanguage, setTranslateTargetLanguage] = useState<SupportedLanguage>("en");
  const [isStartingTranslation, setIsStartingTranslation] = useState(false);
  const [translateMessage, setTranslateMessage] = useState<string | null>(null);
  type TranslationUiStatus = "idle" | "translating" | "done" | "error";
  const [translationUiStatus, setTranslationUiStatus] = useState<TranslationUiStatus>("idle");
  const [lastRequestedTargetLanguage, setLastRequestedTargetLanguage] = useState<SupportedLanguage | null>(null);
  const translationPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const translationDoneTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const savingRef = useRef(false);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const originalBook = groupBooks.find((b) => b.id === groupId) ?? groupBooks[0];
  const groupTitle = originalBook.title || "Untitled";
  const languageTabs = buildLanguageTabs(groupId, groupBooks);

  useEffect(() => {
    const nextChapters = chaptersByBookId[activeBookId] ?? [];
    setChapters(nextChapters.length > 0 ? nextChapters : []);
    setSelectedChapterId((prev) => {
      const stillExists = nextChapters.some((c) => c.id === prev);
      return stillExists ? prev : nextChapters[0]?.id ?? null;
    });
  }, [activeBookId, chaptersByBookId]);

  useEffect(() => {
    setOriginalUrl(book.original_url ?? "");
    setTranslationStatus(book.translation_status ?? "draft");
  }, [book.id, book.original_url, book.translation_status]);

  const selectedChapter = chapters.find((ch) => ch.id === selectedChapterId);
  const displayCoverUrl = coverPreviewUrl ?? book.cover_image;
  const displayTitle = editingBookTitle ? bookTitleValue : groupTitle;
  const isOriginal = book.id === groupId;

  const handlePublish = async () => {
    if (isPublishing) return;
    setIsPublishing(true);
    try {
      const res = await fetch(`/api/books/${book.id}/publish`, { method: "POST" });
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

  useEffect(() => {
    setOriginalUrl(book.original_url ?? "");
  }, [book.original_url]);

  useEffect(() => {
    setTranslationStatus(book.translation_status ?? "draft");
  }, [book.translation_status]);

  const handleTranslationStatusChange = useCallback(
    async (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value as TranslationStatus;
      if (!TRANSLATION_STATUSES.includes(value)) return;
      setTranslationStatus(value);
      const supabase = createClient();
      const { error } = await supabase.from("books").update({ translation_status: value }).eq("id", book.id);
      if (error) {
        if (process.env.NODE_ENV === "development") console.error("[translation_status update failed]", error);
        setTranslationStatus(book.translation_status ?? "draft");
      } else router.refresh();
    },
    [book.id, book.translation_status, router]
  );

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
    const maxOrder = chapters.length > 0 ? Math.max(...chapters.map((ch) => ch.order)) : 0;
    const { data, error } = await supabase
      .from("chapters")
      .insert({
        book_id: book.id,
        title: `Chapter ${maxOrder + 1}`,
        content: "",
        order: maxOrder + 1,
      })
      .select("id, title, content, order")
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

  const handleSwitchLanguage = useCallback(
    (bookId: string, langKey: string) => {
      setActiveBookId(bookId);
      const params = new URLSearchParams(window.location.search);
      if (langKey === ORIGINAL_LANG) {
        params.delete("lang");
      } else {
        params.set("lang", langKey);
      }
      const query = params.toString();
      const url = `/author/books/${groupId}${query ? `?${query}` : ""}`;
      router.replace(url, { scroll: false });
    },
    [groupId, router]
  );

  const handleStartEditBookTitle = () => {
    setBookTitleValue(groupTitle);
    setEditingBookTitle(true);
  };

  const handleSaveBookTitle = useCallback(async () => {
    const val = bookTitleValue.trim();
    if (!val) {
      setEditingBookTitle(false);
      return;
    }
    const supabase = createClient();
    const { error } = await supabase
      .from("books")
      .update({ title: val })
      .eq("id", groupId);
    if (error) {
      if (process.env.NODE_ENV === "development") console.error("[updateBookTitle failed]", error);
      setEditingBookTitle(false);
      return;
    }
    setEditingBookTitle(false);
    router.refresh();
  }, [bookTitleValue, groupId, router]);

  const handleCancelEditBookTitle = () => {
    setEditingBookTitle(false);
    setBookTitleValue("");
  };

  const existingTranslationLanguages = useMemo(() => {
    return new Set(
      groupBooks
        .filter((b) => b.is_translation && b.language)
        .map((b) => String(b.language).toLowerCase())
    );
  }, [groupBooks]);

  const availableTranslateLanguages = useMemo(
    () => SUPPORTED_LANGUAGE_CODES.filter((code) => !existingTranslationLanguages.has(code)),
    [existingTranslationLanguages]
  );

  useEffect(() => {
    if (availableTranslateLanguages.length > 0 && !availableTranslateLanguages.includes(translateTargetLanguage)) {
      setTranslateTargetLanguage(availableTranslateLanguages[0]);
    }
  }, [availableTranslateLanguages, translateTargetLanguage]);

  // När groupBooks uppdateras (t.ex. efter polling) och vi väntar på en översättning, kolla om den dykt upp
  useEffect(() => {
    if (translationUiStatus !== "translating" || !lastRequestedTargetLanguage) return;
    const hasNewTranslation = groupBooks.some(
      (b) => Boolean(b.is_translation && b.language && String(b.language).toLowerCase() === lastRequestedTargetLanguage)
    );
    if (hasNewTranslation) {
      if (translationPollRef.current) {
        clearInterval(translationPollRef.current);
        translationPollRef.current = null;
      }
      const addedLang = lastRequestedTargetLanguage;
      setTranslationUiStatus("done");
      setTranslateMessage(`Översättning tillagd (${getLanguageLabel(addedLang)}).`);
      setLastRequestedTargetLanguage(null);
      const remaining = availableTranslateLanguages.filter((l) => l !== addedLang);
      if (remaining[0]) setTranslateTargetLanguage(remaining[0]);
      if (translationDoneTimeoutRef.current) clearTimeout(translationDoneTimeoutRef.current);
      translationDoneTimeoutRef.current = setTimeout(() => {
        setTranslationUiStatus("idle");
        setTranslateMessage(null);
        translationDoneTimeoutRef.current = null;
      }, 5000);
    }
  }, [groupBooks, translationUiStatus, lastRequestedTargetLanguage, availableTranslateLanguages]);

  // Städa poll och timeout vid unmount
  useEffect(() => {
    return () => {
      if (translationPollRef.current) {
        clearInterval(translationPollRef.current);
        translationPollRef.current = null;
      }
      if (translationDoneTimeoutRef.current) {
        clearTimeout(translationDoneTimeoutRef.current);
        translationDoneTimeoutRef.current = null;
      }
    };
  }, []);

  const handleStartTranslation = useCallback(async () => {
    if (isStartingTranslation || !availableTranslateLanguages.includes(translateTargetLanguage)) return;
    setIsStartingTranslation(true);
    setTranslateMessage(null);
    setTranslationUiStatus("idle");
    try {
      const url = `/api/books/${groupId}/translate`;
      if (process.env.NODE_ENV === "development") {
        console.log("[translate] POST", url, { targetLanguage: translateTargetLanguage });
      }
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetLanguage: translateTargetLanguage }),
      });
      const data = await res.json().catch(() => ({}));
      if (process.env.NODE_ENV === "development") {
        console.log("[translate] response", res.status, data);
      }
      if (!res.ok) {
        const errMsg = data.error ?? "Failed to start translation";
        setTranslateMessage(errMsg);
        setTranslationUiStatus("error");
        return;
      }
      setLastRequestedTargetLanguage(translateTargetLanguage);
      setTranslationUiStatus("translating");
      setTranslateMessage("Översättning startad. Väntar på att den blir klar…");
      if (translationPollRef.current) {
        clearInterval(translationPollRef.current);
      }
      translationPollRef.current = setInterval(() => {
        router.refresh();
      }, 3000);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Failed to start translation";
      setTranslateMessage(errMsg);
      setTranslationUiStatus("error");
      if (process.env.NODE_ENV === "development") {
        console.error("[translate] error", err);
      }
    } finally {
      setIsStartingTranslation(false);
    }
  }, [groupId, translateTargetLanguage, availableTranslateLanguages, isStartingTranslation, router]);

  const handleDeleteBook = useCallback(async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/books/${book.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error ?? "Failed to delete book");
        return;
      }
      router.push("/author/books");
    } catch {
      alert("Failed to delete book");
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  }, [book.id, isDeleting, router]);

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
      <section className="mx-auto max-w-[1400px] px-6 py-12">
        {languageTabs.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-1 border-b border-slate-200 dark:border-white/10 pb-2">
            {languageTabs.map((tab) => (
              <button
                key={tab.langKey}
                type="button"
                onClick={() => handleSwitchLanguage(tab.book.id, tab.langKey)}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                  activeBookId === tab.book.id
                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                    : "text-slate-600 hover:bg-slate-100 dark:text-white/60 dark:hover:bg-white/10"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            {editingBookTitle ? (
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  value={bookTitleValue}
                  onChange={(e) => setBookTitleValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveBookTitle();
                    if (e.key === "Escape") handleCancelEditBookTitle();
                  }}
                  className="max-w-md rounded-lg border border-slate-300 bg-white px-3 py-2 text-xl font-semibold text-slate-900 focus:border-slate-500 focus:outline-none dark:border-white/20 dark:bg-white/10 dark:text-white"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleSaveBookTitle}
                    className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelEditBookTitle}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 dark:border-white/20 dark:text-white/70 dark:hover:bg-white/10"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h1 className="text-4xl font-semibold tracking-tight text-slate-900 dark:text-white">
                  {displayTitle}
                </h1>
                <div className="mt-2 flex items-center gap-2">
                  <p className="text-sm text-slate-600 dark:text-white/60">
                    {book.status === "DRAFT" ? "Draft" : "Published"} • {chapters.length} chapter{chapters.length !== 1 ? "s" : ""}
                  </p>
                  <button
                    type="button"
                    onClick={handleStartEditBookTitle}
                    className="text-sm text-slate-500 hover:text-slate-900 dark:text-white/50 dark:hover:text-white"
                  >
                    Rename
                  </button>
                </div>
              </>
            )}
          </div>
          {book.status === "DRAFT" && (
            <button
              onClick={handlePublish}
              disabled={isPublishing || chapters.length === 0}
              className="rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
            >
              {isPublishing
                ? "Publishing..."
                : book.is_translation
                  ? "Publish your translation"
                  : "Publish"}
            </button>
          )}
        </div>

        <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
          <div className="space-y-5">
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

            {getTranslationsEnabled() && book.is_translation && (
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5 dark:border-white/10 dark:bg-white/5">
                <h2 className="mb-3 text-base font-semibold text-slate-900 dark:text-white">Translation</h2>
                <div className="mb-3 flex items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      translationStatus === "published"
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
                        : translationStatus === "ready"
                          ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                          : translationStatus === "needs_review"
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                            : "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
                    }`}
                  >
                    {translationStatus}
                  </span>
                </div>
                <label htmlFor="translation-status-select" className="mb-1 block text-xs text-slate-500 dark:text-white/50">Status</label>
                <select
                  id="translation-status-select"
                  value={translationStatus}
                  onChange={handleTranslationStatusChange}
                  className="mb-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none dark:border-white/20 dark:bg-white/10 dark:text-white"
                >
                  {TRANSLATION_STATUSES.map((s) => (
                    <option key={s} value={s}>{s.replace("_", " ")}</option>
                  ))}
                </select>
                {book.original_book_id && (
                  <p className="text-xs text-slate-500 dark:text-white/50">
                    <button
                      type="button"
                      onClick={() => handleSwitchLanguage(groupId, ORIGINAL_LANG)}
                      className="text-emerald-600 underline dark:text-emerald-400"
                    >
                      Switch to original →
                    </button>
                  </p>
                )}
              </div>
            )}

            {getTranslationsEnabled() && isOriginal && (
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5 dark:border-white/10 dark:bg-white/5">
                <h2 className="mb-3 text-base font-semibold text-slate-900 dark:text-white">Add translation</h2>
                <p className="mb-3 text-xs text-slate-500 dark:text-white/50">
                  Create a new language version of this book. The translation will appear as a tab when ready.
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
                <label htmlFor="translate-language" className="mb-1 block text-xs text-slate-500 dark:text-white/50">Language</label>
                <select
                  id="translate-language"
                  value={availableTranslateLanguages.length > 0 ? translateTargetLanguage : ""}
                  onChange={(e) => setTranslateTargetLanguage(e.target.value as SupportedLanguage)}
                  disabled={availableTranslateLanguages.length === 0 || translationUiStatus === "translating"}
                  className="mb-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none disabled:opacity-60 dark:border-white/20 dark:bg-white/10 dark:text-white"
                >
                  {availableTranslateLanguages.length === 0 ? (
                    <option value="">All languages added</option>
                  ) : (
                    availableTranslateLanguages.map((code) => (
                      <option key={code} value={code}>{getLanguageLabel(code)}</option>
                    ))
                  )}
                </select>
                <button
                  type="button"
                  onClick={handleStartTranslation}
                  disabled={translationUiStatus === "translating" || availableTranslateLanguages.length === 0}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
                >
                  {translationUiStatus === "translating" || isStartingTranslation ? "Startar…" : "Start translation"}
                </button>
                {translateMessage && (
                  <div
                    className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
                      translationUiStatus === "done" || translateMessage.includes("tillagd") || translateMessage.includes("startad")
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

            {chapters.length > 0 && (
              <p className="mt-4 text-xs text-slate-400 dark:text-white/40">Double-click to rename</p>
            )}
            </div>

            <div className="rounded-xl border border-red-200 bg-red-50/50 p-5 dark:border-red-900/30 dark:bg-red-950/20">
              <h2 className="mb-2 text-base font-semibold text-slate-900 dark:text-white">Delete book</h2>
              <p className="mb-3 text-xs text-slate-500 dark:text-white/50">
                Permanently remove this {book.is_translation ? "translation" : "book"} and its chapters. This cannot be undone.
              </p>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={isDeleting}
                className="w-full rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-950/50"
              >
                Delete book
              </button>
            </div>
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
      </section>

      {showDeleteConfirm && (
        <div
          className="fixed inset-0 z-[10002] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-dialog-title"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-slate-900">
            <h2 id="delete-dialog-title" className="text-lg font-semibold text-slate-900 dark:text-white">
              Vill du verkligen radera denna bok?
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-white/60">
              Boken och alla kapitel tas bort permanent. Detta kan inte ångras.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
              >
                Avbryt
              </button>
              <button
                type="button"
                onClick={handleDeleteBook}
                disabled={isDeleting}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                {isDeleting ? "Raderar…" : "Radera"}
              </button>
            </div>
          </div>
        </div>
      )}

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
