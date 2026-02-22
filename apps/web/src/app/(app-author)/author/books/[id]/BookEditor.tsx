"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { uploadBookCover } from "@/lib/supabase/storage";
import TiptapEditor from "@/components/editor/TiptapEditor";
import AuthorStatsBar from "@/components/editor/AuthorStatsBar";
import CommandPalette from "@/components/editor/CommandPalette";
import DeleteBookButton from "@/components/books/DeleteBookButton";
import { BookJobsBanner } from "@/components/books/JobStatusBanner";
import { useToastHelpers } from "@/components/ui/toast";
import { useBookJobs, type UnifiedJob } from "@/hooks/useBookJobs";
import { useBillingState } from "@/hooks/useBillingState";
import { resolveErrorMessage } from "@/lib/error-messages";
import { getAudiobookEnabled, getMarketingEnabled, getRecommendationsEnabled, getTranslationsEnabled } from "@/lib/flags";
import GenreSelector from "@/components/books/GenreSelector";
import { isJobActiveStatus, normalizeJobStatus } from "@/lib/job-status";
import { getLanguageLabel, LANGUAGE_OPTIONS, normalizeLanguage, type SupportedLanguage } from "@/lib/languages";
import { isTranslationPairSupported } from "@/lib/translation-pairs";
import ChapterAudiobookPlayer from "@/app/(reader-browse)/reader/read/[chapterId]/ChapterAudiobookPlayer";

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
type AudiobookGenerationScope = "book" | "current" | "selected";
type AudiobookControlAction = "pause" | "resume" | "cancel";

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
    description: "Visible to everyone. Shown in Discover and on your profile.",
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

/** User-friendly labels for channels (no internal keys in UI) */
const MARKETING_CHANNEL_LABELS: Record<MarketingChannel, string> = {
  generic: "General",
  tiktok: "TikTok",
  instagram: "Instagram",
  x: "X",
};

/** Display status: pending -> running -> completed / failed. */
const STATUS_LABELS = {
  pending: "Queued",
  running: "Running",
  completed: "Succeeded",
  failed: "Failed",
  idle: "Queued",
} as const;

function getAudiobookStatusLabel(status: string): string {
  if (status === "published" || status === "generated" || status === "completed") return STATUS_LABELS.completed;
  if (status === "generating") return STATUS_LABELS.running;
  if (status === "queued") return STATUS_LABELS.pending;
  if (status === "paused") return "Paused";
  if (status === "pause_requested") return "Pause requested";
  if (status === "cancel_requested") return "Stopping...";
  if (status === "cancelled") return "Cancelled";
  if (status === "failed") return STATUS_LABELS.failed;
  return "No audiobook yet";
}

function formatAudiobookEta(seconds: number | null | undefined): string | null {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) return null;
  const roundedSeconds = Math.round(seconds);
  if (roundedSeconds < 60) return "Less than 1 min remaining";

  const totalMinutes = Math.round(roundedSeconds / 60);
  if (totalMinutes < 60) return `About ${totalMinutes} min remaining`;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (minutes === 0) return `About ${hours}h remaining`;
  return `About ${hours}h ${minutes}m remaining`;
}

function getMarketingCampaignStatusLabel(status: string): string {
  if (status === "generated" || status === "published") return STATUS_LABELS.completed;
  if (status === "failed") return STATUS_LABELS.failed;
  if (status === "pending" || status === "generating") return STATUS_LABELS.running;
  return STATUS_LABELS.idle;
}

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
  price_amount?: number | null;
  price_currency?: string | null;
};

type BookVersion = {
  id: string;
  book_id: string;
  language_code: string;
  status: string;
  published_at?: string | null;
  published_chapter_count?: number | null;
  visibility?: PublishVisibility | null;
  created_at?: string;
  updated_at?: string;
  error_message?: string | null;
};

type LatestAudiobookAsset = {
  id: string;
  /** Signed URL (never a raw DB column). null when audio_path is missing. */
  audioSignedUrl: string | null;
  status: string;
  created_at: string;
} | null;

const TRANSLATION_POLL_MAX_MS = 120_000;

const IMPORT_ALLOWED_EXT = [".epub", ".docx", ".html", ".htm", ".txt", ".pdf"];
const IMPORT_MAX_MB = 50;
const IMPORT_MAX_BYTES = IMPORT_MAX_MB * 1024 * 1024;

function ImportManusSection({
  bookId,
  bookVersionId,
  refetchJobs,
  importJobs,
}: {
  bookId: string;
  bookVersionId: string | null;
  refetchJobs: () => Promise<void>;
  importJobs: UnifiedJob[];
}) {
  const [overwrite, setOverwrite] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [repairing, setRepairing] = useState(false);
  const [repairMessage, setRepairMessage] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{ chaptersCreated?: number; titleSet?: boolean; warnings?: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const visibleImportJobs = useMemo(() => {
    if (importJobs.length === 0) return [];
    const active = importJobs.filter((job) => isJobActiveStatus(job.status));
    if (active.length > 0) return active;
    return [importJobs[0]];
  }, [importJobs]);

  const handleFile = useCallback((file: File | null) => {
    setError(null);
    setRepairMessage(null);
    setLastResult(null);
    if (!file) {
      setSelectedFile(null);
      return;
    }
    const ext = "." + (file.name.split(".").pop() ?? "").toLowerCase();
    if (!IMPORT_ALLOWED_EXT.includes(ext)) {
      setError(`Supported file types: ${IMPORT_ALLOWED_EXT.join(", ")}.`);
      setSelectedFile(null);
      return;
    }
    if (file.size > IMPORT_MAX_BYTES) {
      setError(`Max file size is ${IMPORT_MAX_MB} MB.`);
      setSelectedFile(null);
      return;
    }
    setSelectedFile(file);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      handleFile(e.dataTransfer.files?.[0] ?? null);
    },
    [handleFile]
  );

  const startImport = useCallback(async () => {
    if (!selectedFile || uploading) return;
    setError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", selectedFile);
      form.append("bookId", bookId);
      if (bookVersionId) form.append("bookVersionId", bookVersionId);
      form.append("overwrite", String(overwrite));
      const res = await fetch("/api/books/import", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(resolveErrorMessage(data?.error as string));
        return;
      }
      setLastResult({ chaptersCreated: undefined, titleSet: undefined });
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await refetchJobs();
    } catch {
      setError("Could not start import. Try again.");
    } finally {
      setUploading(false);
    }
  }, [selectedFile, uploading, bookId, bookVersionId, overwrite, refetchJobs]);

  const runChapterRepair = useCallback(async () => {
    if (repairing) return;
    if (!bookVersionId) {
      setRepairMessage("No active version found.");
      return;
    }

    setError(null);
    setRepairMessage(null);
    setRepairing(true);

    try {
      const res = await fetch(`/api/books/${bookId}/chapters/repair`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bookVersionId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRepairMessage(resolveErrorMessage(data?.error as string));
        return;
      }

      const updatedCount =
        typeof data?.updatedCount === "number" ? Number(data.updatedCount) : 0;
      if (updatedCount > 0) {
        setRepairMessage(`Done: repaired  chapter headings.`);
      } else {
        setRepairMessage("Nothing to repair in this version.");
      }
      router.refresh();
    } catch {
      setRepairMessage("Could not repair chapter headings. Try again.");
    } finally {
      setRepairing(false);
    }
  }, [bookId, bookVersionId, repairing, router]);

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Import manuscript</h2>
      <p className="text-sm text-slate-600 dark:text-white/60">
        Upload a file to import chapters into this book. Supported formats: EPUB, DOCX, HTML, TXT, PDF. Max {IMPORT_MAX_MB} MB.
      </p>

      <div className="rounded-2xl border border-black/[0.05] bg-white/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.02)] backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02] dark:shadow-none space-y-4">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Import behavior</h3>
        <div className="flex items-center gap-3">
          <input
            type="radio"
            id="import-new-version"
            name="import-mode"
            checked={!overwrite}
            onChange={() => setOverwrite(false)}
            aria-label="Import as new version"
            className="h-4 w-4 accent-[#907AFF]"
          />
          <label htmlFor="import-new-version" className="text-sm text-slate-700 dark:text-white/80">Import as new version</label>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="radio"
            id="import-overwrite"
            name="import-mode"
            checked={overwrite}
            onChange={() => setOverwrite(true)}
            aria-label="Overwrite draft"
            className="h-4 w-4 accent-[#907AFF]"
          />
          <label htmlFor="import-overwrite" className="text-sm text-slate-700 dark:text-white/80">Overwrite draft</label>
        </div>
        {overwrite && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200" role="alert">
            Import can overwrite existing chapters in this version. Use &quot;Import as new version&quot; if you want to keep them.
          </div>
        )}
      </div>

      <div
        className={`rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${
          selectedFile ? "border-[#907AFF]/40 bg-[#907AFF]/5 dark:bg-[#907AFF]/10" : "border-black/[0.06] dark:border-white/[0.06] bg-white/50 dark:bg-white/[0.02]"
        }`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={IMPORT_ALLOWED_EXT.join(",")}
          className="hidden"
          aria-label="Choose file to import"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          disabled={uploading}
        />
        <p className="text-sm text-slate-600 dark:text-white/60 mb-2">
          Drag and drop a file here, or click to choose. {IMPORT_ALLOWED_EXT.join(", ")} - max {IMPORT_MAX_MB} MB.
        </p>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="rounded-xl border border-black/[0.08] bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white dark:hover:bg-white/[0.06]"
        >
          Choose file
        </button>
        {selectedFile && (
          <p className="mt-3 text-sm font-medium text-slate-900 dark:text-white">
            Selected file: {selectedFile.name}
          </p>
        )}
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>}

      <button
        type="button"
        onClick={startImport}
        disabled={!selectedFile || uploading}
        aria-label="Start import"
        className="rounded-xl bg-slate-900 px-4 py-2.5 text-[13px] font-semibold text-white shadow-sm transition-all hover:bg-slate-800 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed dark:bg-white dark:text-slate-900"
      >
        {uploading ? "Starting import..." : "Start import"}
      </button>

      <div className="rounded-xl border border-black/[0.06] bg-slate-50/50 px-4 py-3 dark:border-white/[0.06] dark:bg-white/5">
        <p className="text-sm font-medium text-slate-900 dark:text-white">Repair existing import</p>
        <p className="mt-1 text-xs text-slate-600 dark:text-white/60">
          Run this if chapter headings are already incorrect (for example duplicated or out of order).
        </p>
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={runChapterRepair}
            disabled={!bookVersionId || repairing || uploading}
            aria-label="Repair chapter headings"
            className="rounded-xl border border-black/[0.08] bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white dark:hover:bg-white/[0.06]"
          >
            {repairing ? "Repairing..." : "Repair chapter headings"}
          </button>
          {repairMessage && <p className="text-sm text-slate-700 dark:text-white/80">{repairMessage}</p>}
        </div>
      </div>

      {lastResult && !importJobs.some((j) => isJobActiveStatus(j.status)) && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-800 dark:bg-emerald-950/30">
          <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">Import has started. Follow status in the banner above.</p>
          {lastResult.chaptersCreated != null && <p className="text-sm text-emerald-700 dark:text-emerald-300">Chapter count: {lastResult.chaptersCreated}</p>}
        </div>
      )}

      {visibleImportJobs.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Import status</h3>
          {visibleImportJobs.map((job) => {
            const meta = (job.meta ?? {}) as Record<string, unknown>;
            const chaptersCreated =
              typeof meta.chaptersCreated === "number" ? meta.chaptersCreated : null;
            const frontMatterCount =
              typeof meta.frontMatterCount === "number" ? meta.frontMatterCount : null;
            const titleSet = meta.titleSet === true;
            const resolvedTitle = typeof meta.bookTitle === "string" ? meta.bookTitle : null;
            const warnings = Array.isArray(meta.warnings)
              ? meta.warnings.filter((value): value is string => typeof value === "string")
              : [];

            return (
              <div
                key={job.id}
                className={`rounded-xl border px-4 py-3 text-sm ${
                  job.status === "failed"
                    ? "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30"
                    : job.status === "completed"
                      ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30"
                      : "border-black/[0.06] bg-slate-50/50 dark:border-white/[0.06] dark:bg-white/5"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-900 dark:text-white">
                    {job.status === "pending" && "Queued..."}
                    {job.status === "running" && `Importing... `}
                    {job.status === "completed" && "Import succeeded"}
                    {job.status === "failed" && "Import failed"}
                  </span>
                  {(job.status === "pending" || job.status === "running") && (
                    <span className="text-xs text-slate-500 dark:text-white/50">
                      {job.progress > 0 ? `${job.progress}%` : "Queued"}
                    </span>
                  )}
                </div>
                {job.status === "running" && job.progress > 0 && (
                  <div className="mt-2 h-1.5 w-full rounded-full bg-slate-200 dark:bg-white/10">
                    <div
                      className="h-1.5 rounded-full bg-[#907AFF] transition-all"
                      style={{ width: `${Math.min(100, job.progress)}%` }}
                    />
                  </div>
                )}
                {job.error && <p className="mt-1 text-red-700 dark:text-red-300">{job.error}</p>}
                {job.status === "completed" && chaptersCreated != null && (
                  <p className="mt-1 text-emerald-700 dark:text-emerald-300">
                    {chaptersCreated} chapters imported
                  </p>
                )}
                {job.status === "completed" && frontMatterCount != null && frontMatterCount > 0 && (
                  <p className="mt-1 text-emerald-700 dark:text-emerald-300">
                    {frontMatterCount} intro sections (foreword/contents) were split automatically
                  </p>
                )}
                {job.status === "completed" && titleSet && resolvedTitle && (
                  <p className="mt-1 text-emerald-700 dark:text-emerald-300">
                    Title set automatically: {resolvedTitle}
                  </p>
                )}
                {warnings.length > 0 && (
                  <p className="mt-1 text-xs text-slate-500 dark:text-white/50">
                    Notes: {warnings.join(", ")}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

type Props = {
  book: Book;
  chapters: Chapter[];
  bookVersions: BookVersion[];
  activeVersion: BookVersion | null;
  latestAudiobookAsset?: LatestAudiobookAsset;
  marketingCampaigns?: MarketingCampaignRow[];
  stripeConfigured?: boolean;
};

type EditorPanel = "editor" | "pricing" | "import";

export default function BookEditor({
  book,
  chapters: initialChapters,
  bookVersions,
  activeVersion,
  latestAudiobookAsset = null,
  marketingCampaigns = [],
  stripeConfigured = false,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToastHelpers();
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
  const [publishMenuOpen, setPublishMenuOpen] = useState(false);
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
  const translationSourceLang = useMemo(
    () => normalizeLanguage(activeVersion?.language_code ?? book.original_language ?? book.language),
    [activeVersion?.language_code, book.original_language, book.language],
  );
  const [translateTargetLanguage, setTranslateTargetLanguage] = useState<SupportedLanguage>(initialTargetLanguage);
  const [isStartingTranslation, setIsStartingTranslation] = useState(false);
  const [isPollingTranslation, setIsPollingTranslation] = useState(false);
  const [translateMessage, setTranslateMessage] = useState<string | null>(null);
  const [translationQueueHealthy, setTranslationQueueHealthy] = useState<boolean | null>(null);
  const [lastRequestedTargetLanguage, setLastRequestedTargetLanguage] = useState<SupportedLanguage | null>(null);
  const [translationProgress, setTranslationProgress] = useState<{ translated: number; total: number } | null>(null);
  const translationPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const translationPollStartedAtRef = useRef<number>(0);
  const lastRequestedTargetLanguageRef = useRef<SupportedLanguage | null>(null);
  const [isGeneratingAudiobook, setIsGeneratingAudiobook] = useState(false);
  const [audiobookError, setAudiobookError] = useState<string | null>(null);
  const [audiobookProgress, setAudiobookProgress] = useState<{
    totalChapters: number;
    completedChapters: number;
    currentChapterTitle: string | null;
    estimatedSecondsRemaining: number | null;
  } | null>(null);
  const [audiobookScope, setAudiobookScope] = useState<AudiobookGenerationScope>("book");
  const [audiobookSelectedChapterIds, setAudiobookSelectedChapterIds] = useState<string[]>([]);
  const [isAudiobookChapterPickerOpen, setIsAudiobookChapterPickerOpen] = useState(false);
  const [audiobookControlPending, setAudiobookControlPending] = useState<AudiobookControlAction | null>(null);
  const pricingSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const publishMenuButtonRef = useRef<HTMLButtonElement>(null);
  const publishMenuRef = useRef<HTMLDivElement>(null);

  const initialPriceMinor = Math.max(0, Math.trunc(Number(book.price_amount ?? 0)));
  const initialCurrency = ["SEK", "EUR", "USD"].includes(String(book.price_currency ?? "").trim().toUpperCase())
    ? String(book.price_currency).trim().toUpperCase()
    : "SEK";
  const [priceAmountMinor, setPriceAmountMinor] = useState(initialPriceMinor);
  const [priceCurrency, setPriceCurrency] = useState(initialCurrency);
  const [pricingSaving, setPricingSaving] = useState(false);
  const [pricingError, setPricingError] = useState<string | null>(null);
  const [pricingSaved, setPricingSaved] = useState(false);

  const { jobs: allJobs, loading: jobLoading, error: jobError, refetch: refetchBookJob, settled: jobsSettled } = useBookJobs(book.id);
  const billing = useBillingState();

  // Jobs shown in banner: never show audiobook when feature is disabled.
  const jobsForBanner = useMemo(
    () => (getAudiobookEnabled() ? allJobs : allJobs.filter((j) => j.kind !== "audiobook")),
    [allJobs]
  );

  // Import jobs filtered for inline progress in ImportManusSection.
  const importJobs = useMemo(() => allJobs.filter((j) => j.kind === "import"), [allJobs]);

  // Audiobook state only when feature is enabled (no empty/dead states).
  const latestAudiobookJob = useMemo(
    () => (getAudiobookEnabled() ? allJobs.find((j) => j.kind === "audiobook") ?? null : null),
    [allJobs]
  );
  const audiobookJobStatus = latestAudiobookJob ? normalizeJobStatus(latestAudiobookJob.status) : null;
  const STALE_PENDING_MS = 2 * 60 * 60 * 1000; // 2 hours
  const isAudiobookJobStale =
    latestAudiobookJob &&
    audiobookJobStatus === "pending" &&
    latestAudiobookJob.createdAt &&
    Date.now() - new Date(latestAudiobookJob.createdAt).getTime() > STALE_PENDING_MS;
  const isAudiobookJobActive =
    !isAudiobookJobStale &&
    (audiobookJobStatus === "running" || audiobookJobStatus === "pending");
  const isAudiobookJobFailed = normalizeJobStatus(latestAudiobookJob?.status) === "failed";
  const isAudiobookActive = isGeneratingAudiobook || !!isAudiobookJobActive;
  const serverAudiobookProgress = useMemo(() => {
    if (!latestAudiobookJob || !isJobActiveStatus(latestAudiobookJob.status)) return null;
    const meta = latestAudiobookJob.meta as Record<string, unknown>;
    return {
      totalChapters: (meta.totalChapters as number) ?? 0,
      completedChapters: (meta.completedChapters as number) ?? 0,
      currentChapterTitle: (meta.currentChapterTitle as string) ?? null,
      estimatedSecondsRemaining: (meta.estimatedSecondsRemaining as number) ?? null,
    };
  }, [latestAudiobookJob]);
  const effectiveAudiobookProgress = audiobookProgress ?? serverAudiobookProgress;
  const audiobookEtaText = formatAudiobookEta(effectiveAudiobookProgress?.estimatedSecondsRemaining);
  const effectiveAudiobookError = audiobookError ?? (isAudiobookJobFailed ? (latestAudiobookJob?.error ?? null) : null);

  useEffect(() => {
    setChapters(initialChapters);
    setSelectedChapterId(initialChapters[0]?.id ?? null);
  }, [initialChapters]);

  useEffect(() => {
    const minor = Math.max(0, Math.trunc(Number(book.price_amount ?? 0)));
    const cur = ["SEK", "EUR", "USD"].includes(String(book.price_currency ?? "").trim().toUpperCase())
      ? String(book.price_currency).trim().toUpperCase()
      : "SEK";
    setPriceAmountMinor(minor);
    setPriceCurrency(cur);
  }, [book.price_amount, book.price_currency]);

  // Cleanup pricingSaved timer on unmount
  useEffect(() => {
    return () => {
      if (pricingSavedTimerRef.current) clearTimeout(pricingSavedTimerRef.current);
    };
  }, []);

  // Refresh server data when all jobs finish
  useEffect(() => {
    if (jobsSettled) router.refresh();
  }, [jobsSettled, router]);

  useEffect(() => {
    if (!publishToast) return;
    const timeoutId = window.setTimeout(() => setPublishToast(null), 3000);
    return () => window.clearTimeout(timeoutId);
  }, [publishToast]);

  useEffect(() => {
    if (!publishMenuOpen) return;
    const handleOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (publishMenuRef.current?.contains(target)) return;
      if (publishMenuButtonRef.current?.contains(target)) return;
      setPublishMenuOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPublishMenuOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [publishMenuOpen]);

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
  const editorPanel: EditorPanel =
    panelParam === "pricing" ? "pricing" : panelParam === "import" ? "import" : "editor";

  useEffect(() => {
    if (panelParam !== "publish") return;
    publishMenuButtonRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    setPublishMenuOpen(true);
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
  const publishedChapterCount =
    typeof activeVersion?.published_chapter_count === "number" &&
    Number.isFinite(activeVersion.published_chapter_count)
      ? Math.max(0, Math.floor(activeVersion.published_chapter_count))
      : null;
  const selectedChapterOrder =
    typeof selectedChapter?.order === "number" && Number.isFinite(selectedChapter.order)
      ? selectedChapter.order
      : null;
  const selectedChapterAlreadyPublished =
    Boolean(isPublished) &&
    (publishedChapterCount === null
      ? true
      : selectedChapterOrder != null && selectedChapterOrder < publishedChapterCount);

  const missingPublishRequirements = useMemo(() => {
    const missing: string[] = [];
    if (!bookTitle.trim()) missing.push("Add a title");
    if (!displayCoverUrl) missing.push("Ladda upp en omslagsbild");
    if (!activeVersion?.id) missing.push("Create a book version");
    if (chapters.length === 0) {
      missing.push("Add at least one chapter");
    } else if (!chapters.some((chapter) => hasReadableContent(chapter.content))) {
      missing.push("Write content in at least one chapter");
    }
    return missing;
  }, [bookTitle, displayCoverUrl, activeVersion?.id, chapters]);

  const publishDisabled = isPublishing || coverUploading || missingPublishRequirements.length > 0;
  const chapterPublishDisabled =
    isPublishing ||
    coverUploading ||
    missingPublishRequirements.length > 0 ||
    !selectedChapter ||
    !hasReadableContent(selectedChapter.content) ||
    selectedChapterAlreadyPublished;
  const visibilityChanged = isPublished && activeVisibility != null && publishVisibility !== activeVisibility;
  const confirmCopy =
    confirmPublishAction === "publish"
      ? `Publish this version as ${selectedVisibilityLabel}?`
      : confirmPublishAction === "update"
        ? `Uppdatera synlighet till ${selectedVisibilityLabel}?`
        : confirmPublishAction === "unpublish"
          ? "Unpublish this version? It will no longer be visible to readers."
          : null;
  const publishButtonClass = `flex items-center gap-2 rounded-full bg-gradient-to-b from-[#907AFF] to-[#7c6ae6] px-5 py-2.5 text-[13px] font-semibold text-white shadow-[0_1px_2px_rgba(144,122,255,0.3),inset_0_1px_0_rgba(255,255,255,0.15)] transition-all hover:shadow-[0_4px_12px_rgba(144,122,255,0.35),inset_0_1px_0_rgba(255,255,255,0.15)] hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-[#907AFF]/50 ${
    publishPanelHighlight ? "ring-2 ring-[#907AFF]/50" : ""
  }`;

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

  type TranslationUiStatus = "idle" | "translating" | "done" | "error";
  const isPollingCurrent = isPollingTranslation && lastRequestedTargetLanguage === translateTargetLanguage;
  const translationUiStatus = useMemo<TranslationUiStatus>(() => {
    if (currentTargetVersion?.status === "failed") return "error";
    if (currentTargetVersion?.status === "translating" || isPollingCurrent) return "translating";
    if (currentTargetVersion?.status === "done" || currentTargetVersion?.published_at) return "done";
    return "idle";
  }, [currentTargetVersion?.status, currentTargetVersion?.published_at, isPollingCurrent]);

  const requestedTargetVersionRef = useRef<BookVersion | null>(null);
  const translationFailedCountRef = useRef(0);

  useEffect(() => {
    requestedTargetVersionRef.current = requestedTargetVersion ?? null;
  }, [requestedTargetVersion]);

  useEffect(() => {
    lastRequestedTargetLanguageRef.current = lastRequestedTargetLanguage;
  }, [lastRequestedTargetLanguage]);

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
      translationFailedCountRef.current = 0;
      stopTranslationPoll();
      setTranslationProgress(null);
      setTranslateMessage(`Translation complete (${getLanguageLabel(lastRequestedTargetLanguage)}).`);
      setLastRequestedTargetLanguage(null);
      return;
    }
    if (requestedTargetVersion?.status === "translating") {
      translationFailedCountRef.current = 0;
      return;
    }
    if (requestedTargetVersion?.status === "failed") {
      translationFailedCountRef.current += 1;
      // Only treat as terminal after 2 consecutive "failed" (avoids race: worker may not have set "translating" yet)
      if (translationFailedCountRef.current >= 2) {
        stopTranslationPoll();
        setTranslationProgress(null);
        setTranslateMessage(
          (requestedTargetVersion as BookVersion).error_message?.trim() ||
            "Translation failed. Try again."
        );
        setLastRequestedTargetLanguage(null);
      }
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

  useEffect(() => {
    if (!isPollingTranslation && translationUiStatus !== "translating") {
      setTranslationProgress(null);
    }
  }, [isPollingTranslation, translationUiStatus]);

  // When status is "translating" but we're not polling (e.g. page refresh), still fetch progress
  useEffect(() => {
    if (translationUiStatus !== "translating" || isPollingTranslation || !translateTargetLanguage || !book.id) return;
    const tick = () => {
      fetch(
        `/api/books/${book.id}/translation-progress?targetLanguage=${encodeURIComponent(translateTargetLanguage)}`,
        { cache: "no-store" }
      )
        .then((r) => r.json())
        .then((data: { translated?: number; total?: number }) => {
          const total = typeof data.total === "number" ? data.total : 0;
          const translated = typeof data.translated === "number" ? data.translated : 0;
          if (total > 0) setTranslationProgress({ translated, total });
        })
        .catch(() => {});
    };
    tick();
    const id = setInterval(tick, 3000);
    return () => clearInterval(id);
  }, [translationUiStatus, isPollingTranslation, translateTargetLanguage, book.id]);

  const checkTranslationQueueHealth = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch("/api/health/queue", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      const ok = res.ok && data?.translationQueue === true;
      setTranslationQueueHealthy(ok);
      return ok;
    } catch {
      setTranslationQueueHealthy(false);
      return false;
    }
  }, []);

  useEffect(() => {
    if (!getTranslationsEnabled()) return;
    void checkTranslationQueueHealth();
  }, [checkTranslationQueueHealth]);

  const hasGeneratedAudiobookAsset = latestAudiobookAsset?.status === "generated";
  const latestAudiobookMeta = (latestAudiobookJob?.meta ?? {}) as Record<string, unknown>;
  const latestAudiobookScope =
    typeof latestAudiobookMeta.scope === "string" ? latestAudiobookMeta.scope : "book";
  const latestAudiobookControlState =
    typeof latestAudiobookMeta.controlState === "string" ? latestAudiobookMeta.controlState : null;
  const latestAudiobookPauseRequested = latestAudiobookMeta.pauseRequested === true;
  const latestAudiobookCancelRequested = latestAudiobookMeta.cancelRequested === true;
  const latestAudiobookChapterIds =
    Array.isArray(latestAudiobookMeta.chapterIds) && latestAudiobookMeta.chapterIds.every((id) => typeof id === "string")
      ? (latestAudiobookMeta.chapterIds as string[])
      : [];
  const hasCompletedAudiobookJob =
    normalizeJobStatus(latestAudiobookJob?.status) === "completed" && latestAudiobookScope !== "chapter";
  const hasCompletedChapterAudiobookJob =
    normalizeJobStatus(latestAudiobookJob?.status) === "completed" && latestAudiobookScope === "chapter";
  const hasFailedAudiobookJob = normalizeJobStatus(latestAudiobookJob?.status) === "failed";
  const audiobookFeatureEnabled = getAudiobookEnabled();
  const isAudiobookPaused = latestAudiobookControlState === "paused" || latestAudiobookControlState === "pause_requested";
  const isAudiobookCancelRequested = latestAudiobookControlState === "cancel_requested" || latestAudiobookCancelRequested;
  const isAudiobookCancelled = latestAudiobookControlState === "cancelled";
  const audiobookStatusUi = isAudiobookActive
    ? isAudiobookCancelRequested
      ? "cancel_requested"
      : isAudiobookPaused || latestAudiobookPauseRequested
        ? latestAudiobookControlState === "pause_requested" || latestAudiobookPauseRequested
          ? "pause_requested"
          : "paused"
        : audiobookJobStatus === "pending"
          ? "queued"
          : "generating"
    : hasGeneratedAudiobookAsset || hasCompletedAudiobookJob || hasCompletedChapterAudiobookJob
      ? "published"
      : isAudiobookCancelled
        ? "cancelled"
      : hasFailedAudiobookJob
        ? "failed"
        : (book.audiobook_status ?? "not_started");
  const isProFeatureLocked = billing.loading || !billing.isProActive;
  const proFeatureLockMessage = billing.loading
    ? "Checking subscription..."
    : billing.pastDue
      ? "Your subscription is past_due. Update payment to unlock this feature."
      : "Verkli Pro is required for this feature.";

  const startTranslationPoll = useCallback(() => {
    stopTranslationPoll();
    translationFailedCountRef.current = 0;
    translationPollStartedAtRef.current = Date.now();
    setIsPollingTranslation(true);
    translationPollRef.current = setInterval(() => {
      const info = requestedTargetVersionRef.current;
      const status = info?.status ?? "none";
      const elapsed = Date.now() - translationPollStartedAtRef.current;
      if (elapsed >= TRANSLATION_POLL_MAX_MS && status === "none") {
        stopTranslationPoll();
        setTranslationProgress(null);
        setTranslateMessage("Translation is taking too long. Try again.");
        setLastRequestedTargetLanguage(null);
        return;
      }
      router.refresh();
      const lang = lastRequestedTargetLanguageRef.current;
      if (lang && book.id) {
        fetch(`/api/books/${book.id}/translation-progress?targetLanguage=${encodeURIComponent(lang)}`, {
          cache: "no-store",
        })
          .then((r) => r.json())
          .then((data: { translated?: number; total?: number }) => {
            const total = typeof data.total === "number" ? data.total : 0;
            const translated = typeof data.translated === "number" ? data.translated : 0;
            if (total > 0) setTranslationProgress({ translated, total });
          })
          .catch(() => {});
      }
    }, 3000);
  }, [router, stopTranslationPoll, book.id]);

  const handleStartTranslation = useCallback(
    async (scope: "book" | "chapter" = "book") => {
    if (isStartingTranslation) return;
    setIsStartingTranslation(true);
    setTranslateMessage(null);

    const queueHealthy = await checkTranslationQueueHealth();
    if (!queueHealthy) {
      setTranslateMessage("Translation service is temporarily unavailable. Try again soon.");
      setIsStartingTranslation(false);
      return;
    }

    if (!activeVersion?.id) {
      setTranslateMessage("No active version found.");
      setIsStartingTranslation(false);
      return;
    }

    if (scope === "chapter" && !selectedChapterId) {
      setTranslateMessage("Select a chapter first.");
      setIsStartingTranslation(false);
      return;
    }

    const existingVersion = versionsByLang.get(normalizeLangKey(translateTargetLanguage));
    if (existingVersion?.status === "translating") {
      setTranslateMessage("Translation is already running. Waiting for completion...");
      setLastRequestedTargetLanguage(translateTargetLanguage);
      startTranslationPoll();
      setIsStartingTranslation(false);
      return;
    }

    let overwrite = false;
    let targetVersionId: string | null = null;
    if (existingVersion && scope === "book") {
      // Failed version: allow one-click retry without confirm
      if (existingVersion.status === "failed") {
        overwrite = true;
        targetVersionId = existingVersion.id;
      } else {
        const shouldOverwrite = window.confirm(
          `A ${getLanguageLabel(translateTargetLanguage)} version already exists. Do you want to overwrite it?`
        );
        if (!shouldOverwrite) {
          router.push(`/author/books/${book.id}?lang=${normalizeLangKey(translateTargetLanguage)}`);
          setIsStartingTranslation(false);
          return;
        }
        overwrite = true;
        targetVersionId = existingVersion.id;
      }
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
          chapterId: scope === "chapter" ? selectedChapterId : null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        if (data?.existingVersionId) {
          setTranslateMessage("Version already exists. Opening existing version...");
          router.push(`/author/books/${book.id}?lang=${normalizeLangKey(translateTargetLanguage)}`);
          return;
        }
        setTranslateMessage(resolveErrorMessage(data?.error));
        return;
      }
      setTranslateMessage(
        scope === "chapter"
          ? "Chapter translation started. Waiting for completion..."
          : "Translation started. Waiting for completion..."
      );
      setLastRequestedTargetLanguage(translateTargetLanguage);
      startTranslationPoll();
    } catch {
      setTranslateMessage("Could not start translation. Try again.");
    } finally {
      setIsStartingTranslation(false);
    }
  }, [
    checkTranslationQueueHealth,
    isStartingTranslation,
    startTranslationPoll,
    translateTargetLanguage,
    activeVersion?.id,
    selectedChapterId,
    versionsByLang,
    book.id,
    router,
    ]
  );

  const handlePublishAction = async (action: "publish" | "update" | "unpublish") => {
    if (isPublishing || !activeVersion?.id) return;
    if (action === "publish" && missingPublishRequirements.length > 0) {
      setPublishError("Fix the requirements before publishing.");
      return;
    }
    setIsPublishing(true);
    setPublishError(null);
    let succeeded = false;
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
        setPublishError(resolveErrorMessage(data.error));
        return;
      }
      router.refresh();
      succeeded = true;
      if (action === "publish") {
        setPublishToast("Published");
      } else if (action === "unpublish") {
        setPublishToast("Unpublished");
      } else {
        setPublishToast("Publishing settings updated");
      }
    } catch {
      setPublishError("Could not update publishing settings. Try again.");
    } finally {
      setIsPublishing(false);
      setConfirmPublishAction(null);
      if (succeeded) setPublishMenuOpen(false);
    }
  };

  const handlePublishSelectedChapter = useCallback(async () => {
    if (isPublishing || !activeVersion?.id) return;
    if (!selectedChapter) {
      setPublishError("Select a chapter first.");
      return;
    }
    if (!hasReadableContent(selectedChapter.content)) {
      setPublishError("Selected chapter has no readable content.");
      return;
    }

    const chapterLabel = selectedChapter.title?.trim() || "selected chapter";
    const confirmed = window.confirm(`Publish only "${chapterLabel}" for readers now?`);
    if (!confirmed) return;

    setIsPublishing(true);
    setPublishError(null);
    let succeeded = false;
    try {
      const res = await fetch(`/api/books/${book.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          versionId: activeVersion.id,
          visibility: publishVisibility,
          action: "publish",
          scope: "chapter",
          chapterId: selectedChapter.id,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPublishError(resolveErrorMessage(data.error));
        return;
      }
      router.refresh();
      succeeded = true;
      setPublishToast(`Published chapter: ${chapterLabel}`);
    } catch {
      setPublishError("Could not publish selected chapter. Try again.");
    } finally {
      setIsPublishing(false);
      if (succeeded) setPublishMenuOpen(false);
    }
  }, [
    activeVersion?.id,
    book.id,
    isPublishing,
    publishVisibility,
    router,
    selectedChapter,
  ]);

  const handleChapterPublishToggle = useCallback(async (chapter: Chapter, shouldPublish: boolean) => {
    if (isPublishing || !activeVersion?.id) return;
    if (shouldPublish && !hasReadableContent(chapter.content)) {
      setPublishError("Chapter has no readable content.");
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
          action: shouldPublish ? "publish" : "unpublish",
          scope: "chapter",
          chapterId: chapter.id,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPublishError(resolveErrorMessage(data.error));
        return;
      }
      router.refresh();
      const label = chapter.title?.trim() || "Chapter";
      setPublishToast(shouldPublish ? `Published: ${label}` : `Unpublished: ${label}`);
    } catch {
      setPublishError("Could not update chapter. Try again.");
    } finally {
      setIsPublishing(false);
    }
  }, [activeVersion?.id, book.id, isPublishing, publishVisibility, router]);

  const handleSavePricing = useCallback(async () => {
    setPricingError(null);
    setPricingSaving(true);
    try {
      const res = await fetch(`/api/books/${book.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ price_amount: priceAmountMinor, price_currency: priceCurrency }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPricingError(resolveErrorMessage(data?.error));
        return;
      }
      setPricingSaved(true);
      toast.success("Pricing saved.");
      if (pricingSavedTimerRef.current) clearTimeout(pricingSavedTimerRef.current);
      pricingSavedTimerRef.current = setTimeout(() => setPricingSaved(false), 3000);
      router.refresh();
    } catch {
      setPricingError(resolveErrorMessage(null));
    } finally {
      setPricingSaving(false);
    }
  }, [book.id, priceAmountMinor, priceCurrency, router, toast]);

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
        setCoverError("Choose an image file.");
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
        setCoverError("Cover upload failed. Try again.");
        setCoverUploading(false);
        return;
      }
      if (!url) {
        setCoverError("Cover upload failed. Try again.");
        setCoverUploading(false);
        return;
      }
      const { error: updateError } = await supabase
        .from("books")
        .update({ cover_image: url })
        .eq("id", book.id);
      if (updateError) {
        setCoverError("Could not save cover. Try again.");
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
      setBookTitleError("Title cannot be empty.");
      return;
    }
    if (trimmed.length > 120) {
      setBookTitleError("Title is too long (max 120 characters).");
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
      setBookTitleError("Could not save title. Try again.");
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

  useEffect(() => {
    if (!audiobookFeatureEnabled || !latestAudiobookJob) return;
    const normalizedStatus = normalizeJobStatus(latestAudiobookJob.status);
    const meta = latestAudiobookJob.meta as Record<string, unknown>;
    const controlState = typeof meta.controlState === "string" ? meta.controlState : null;

    if (isJobActiveStatus(normalizedStatus)) {
      setIsGeneratingAudiobook(true);
      setAudiobookError(null);
      setAudiobookProgress({
        totalChapters: (meta.totalChapters as number) ?? 0,
        completedChapters: (meta.completedChapters as number) ?? 0,
        currentChapterTitle: (meta.currentChapterTitle as string) ?? null,
        estimatedSecondsRemaining: (meta.estimatedSecondsRemaining as number) ?? null,
      });
      return;
    }

    setIsGeneratingAudiobook(false);
    if (normalizedStatus === "failed") {
      if (controlState === "cancelled") {
        setAudiobookError("Generation cancelled.");
      } else {
        setAudiobookError(latestAudiobookJob.error ?? "Generation could not be completed. Try again.");
      }
      return;
    }
    if (normalizedStatus === "completed") {
      setAudiobookError(null);
    }
  }, [audiobookFeatureEnabled, latestAudiobookJob]);

  useEffect(() => {
    if (audiobookScope === "current") {
      if (selectedChapterId) {
        setAudiobookSelectedChapterIds([selectedChapterId]);
      } else {
        setAudiobookSelectedChapterIds([]);
      }
      return;
    }

    if (audiobookScope === "selected" && audiobookSelectedChapterIds.length === 0 && selectedChapterId) {
      setAudiobookSelectedChapterIds([selectedChapterId]);
    }
  }, [audiobookScope, audiobookSelectedChapterIds.length, selectedChapterId]);

  useEffect(() => {
    setAudiobookSelectedChapterIds((prev) => prev.filter((chapterId) => chapters.some((chapter) => chapter.id === chapterId)));
  }, [chapters]);

  const audiobookRequestedChapterIds = useMemo(() => {
    if (audiobookScope === "book") return [];
    if (audiobookScope === "current") {
      return selectedChapterId ? [selectedChapterId] : [];
    }
    return Array.from(new Set(audiobookSelectedChapterIds));
  }, [audiobookScope, audiobookSelectedChapterIds, selectedChapterId]);

  const audiobookRequestScope = useMemo<"book" | "chapter" | "chapters">(() => {
    if (audiobookRequestedChapterIds.length === 0) return "book";
    if (audiobookRequestedChapterIds.length === 1) return "chapter";
    return "chapters";
  }, [audiobookRequestedChapterIds]);

  const selectedAudiobookChapters = useMemo(
    () => chapters.filter((chapter) => audiobookRequestedChapterIds.includes(chapter.id)),
    [chapters, audiobookRequestedChapterIds]
  );

  const audiobookSelectionSummary =
    audiobookRequestScope === "book"
      ? "Entire book"
      : audiobookRequestScope === "chapter"
        ? selectedAudiobookChapters[0]?.title ?? "Selected chapter"
        : `${audiobookRequestedChapterIds.length} chapters selected`;

  const canPauseAudiobook =
    isAudiobookActive &&
    audiobookControlPending === null &&
    audiobookStatusUi !== "paused" &&
    audiobookStatusUi !== "pause_requested" &&
    audiobookStatusUi !== "cancel_requested";
  const canResumeAudiobook =
    isAudiobookActive &&
    audiobookControlPending === null &&
    (audiobookStatusUi === "paused" || audiobookStatusUi === "pause_requested");
  const canCancelAudiobook =
    isAudiobookActive &&
    audiobookControlPending === null &&
    audiobookStatusUi !== "cancel_requested";
  const activeAudiobookScopeSummary =
    latestAudiobookScope === "chapter"
      ? (typeof latestAudiobookMeta.currentChapterTitle === "string"
          ? latestAudiobookMeta.currentChapterTitle
          : "Single chapter")
      : latestAudiobookScope === "chapters"
        ? `${Math.max(
            1,
            latestAudiobookChapterIds.length ||
              (effectiveAudiobookProgress?.totalChapters ?? 0)
          )} selected chapters`
        : "Entire book";

  const handleAudiobookControl = useCallback(
    async (action: AudiobookControlAction) => {
      if (!audiobookFeatureEnabled || !isAudiobookActive || audiobookControlPending) return;
      setAudiobookError(null);
      setAudiobookControlPending(action);
      try {
        const res = await fetch(`/api/books/${book.id}/audiobook/control`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setAudiobookError(resolveErrorMessage(data?.error));
          return;
        }
        await refetchBookJob();
      } catch {
        setAudiobookError("Could not update generation state. Try again.");
      } finally {
        setAudiobookControlPending(null);
      }
    },
    [audiobookControlPending, audiobookFeatureEnabled, book.id, isAudiobookActive, refetchBookJob]
  );

  const handleGenerateAudiobook = useCallback(
    async () => {
    if (isGeneratingAudiobook || !audiobookFeatureEnabled) return;
    if (audiobookScope !== "book" && audiobookRequestedChapterIds.length === 0) {
      setAudiobookError("Select chapter(s) first.");
      return;
    }
    setAudiobookError(null);
    setAudiobookProgress(null);
    setIsGeneratingAudiobook(true);
    try {
      const langKey = normalizeLangKey(activeVersion?.language_code ?? activeLanguage);
      const params = new URLSearchParams();
      if (langKey) params.set("lang", langKey);
      const endpoint = `/api/books/${book.id}/audiobook/generate${params.size ? `?${params.toString()}` : ""}`;
      const body =
        audiobookRequestScope === "book"
          ? { scope: "book" as const }
          : {
              scope: audiobookRequestScope,
              chapterIds: audiobookRequestedChapterIds,
            };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAudiobookError(resolveErrorMessage(data.error));
        setIsGeneratingAudiobook(false);
        return;
      }
      // Set initial progress while unified jobs endpoint catches up.
      setAudiobookProgress({
        totalChapters: data.totalChapters ?? 0,
        completedChapters: 0,
        currentChapterTitle: null,
        estimatedSecondsRemaining: null,
      });
      await refetchBookJob();
    } catch {
      setAudiobookError(
        audiobookRequestScope === "book"
          ? "Could not start generation. Try again."
          : "Could not start selected chapter generation. Try again."
      );
      setIsGeneratingAudiobook(false);
    }
  }, [
    activeLanguage,
    activeVersion?.language_code,
    audiobookFeatureEnabled,
    audiobookRequestScope,
    audiobookRequestedChapterIds,
    audiobookScope,
    book.id,
    isGeneratingAudiobook,
    refetchBookJob,
  ]);

  const handleJobRetry = useCallback(
    async (job: UnifiedJob) => {
      if (job.kind === "audiobook") {
        handleGenerateAudiobook();
        return;
      }

      if (job.kind === "translation") {
        if (!activeVersion?.id) {
          toast.error("No active source version found.");
          return;
        }

        const queueHealthy = await checkTranslationQueueHealth();
        if (!queueHealthy) {
          toast.error("Translation service is temporarily unavailable. Try again soon.");
          return;
        }

        const meta = job.meta as Record<string, unknown>;
        const targetLanguage = normalizeLanguage(
          (job.language ?? (meta.languageCode as string) ?? translateTargetLanguage) as string
        );
        const targetVersionId =
          job.bookVersionId ??
          (typeof meta.bookVersionId === "string" && meta.bookVersionId.trim().length > 0
            ? meta.bookVersionId
            : null);

        try {
          const res = await fetch(`/api/books/${book.id}/translate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              targetLanguage,
              sourceVersionId: activeVersion.id,
              targetVersionId,
              overwrite: true,
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || data?.ok === false) {
            toast.error(resolveErrorMessage(data?.error));
            return;
          }
          setTranslateTargetLanguage(targetLanguage);
          setLastRequestedTargetLanguage(targetLanguage);
          setTranslateMessage(`Translation restarted (${getLanguageLabel(targetLanguage)}).`);
          startTranslationPoll();
          await refetchBookJob();
          toast.success("Translation queued again.");
        } catch {
          toast.error("Could not retry translation.");
        }
        return;
      }

      if (job.kind === "import") {
        try {
          const res = await fetch(`/api/books/imports/${job.id}`, { method: "POST" });
          const data = await res.json().catch(() => ({}));
          if (res.ok) {
            await refetchBookJob();
            toast.success(data?.message ?? "Import re-queued.");
          } else {
            toast.error(resolveErrorMessage(data?.error));
          }
        } catch {
          toast.error("Could not retry import.");
        }
      }
    },
    [
      activeVersion?.id,
      book.id,
      checkTranslationQueueHealth,
      handleGenerateAudiobook,
      refetchBookJob,
      startTranslationPoll,
      toast,
      translateTargetLanguage,
    ]
  );

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
      toast.error("Could not save. Changes may not have been persisted.");
      return;
    }
    setChapters((prev) => prev.map((ch) => (ch.id === chapterId ? { ...ch, content: contentString } : ch)));
    setLastSaved(new Date());
  }, [toast]);

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
        toast.error("Could not create version. Try again.");
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
      toast.error("Could not create chapter. Try again.");
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
          <div className="flex flex-shrink-0 items-center justify-between border-b border-black/[0.06]/80 bg-white px-4 py-3 dark:border-white/[0.06] dark:bg-slate-900">
            <span className="text-sm text-slate-500 dark:text-white/50">
              Focus mode - Esc or ⌘⇧F to exit
            </span>
            <div className="flex items-center gap-4">
              <span className="text-xs text-slate-500">{wordCount.toLocaleString()} words</span>
              {sessionWords > 0 && (
                <span className="text-xs text-[#5c4bb8] dark:text-[#b8a9ff]">+{sessionWords} this session</span>
              )}
              <button
                onClick={() => setFocusMode(false)}
                className="rounded-xl bg-slate-900 px-4 py-2.5 text-[13px] font-medium text-white shadow-sm transition-all hover:bg-slate-800 hover:shadow-md dark:bg-white dark:text-slate-900 dark:hover:bg-white/90"
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
                <p className="text-slate-500">Exit focus mode to choose a chapter</p>
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
          className="fixed right-6 top-24 z-[1000] rounded-full bg-slate-900/90 px-4 py-2 text-[13px] font-medium text-white shadow-lg backdrop-blur-sm dark:bg-white/90 dark:text-slate-900"
        >
          {publishToast}
        </div>
      )}
      <section className="mx-auto max-w-[1400px] px-6 pb-20 pt-8">
        {/* Job banner — visible on all panels */}
        {jobLoading ? (
          <div
            className="mb-6 flex h-14 items-center rounded-xl border border-black/[0.06] bg-slate-50/50 px-4 dark:border-white/[0.06] dark:bg-white/5"
            role="status"
            aria-label="Loading status"
          >
            <span className="text-sm text-slate-500 dark:text-white/50">Loading status...</span>
          </div>
        ) : jobError ? (
          <div
            className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/30"
            role="alert"
          >
            <p className="text-sm text-amber-800 dark:text-amber-200">{jobError}</p>
          </div>
        ) : jobsForBanner.length > 0 ? (
          <div className="mb-6">
            <BookJobsBanner jobs={jobsForBanner} onRetry={handleJobRetry} />
          </div>
        ) : null}

        {billing.pastDue && (
          <div
            className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900/40 dark:bg-red-950/30"
            role="alert"
          >
            <p className="text-sm text-red-800 dark:text-red-200">
              Your subscription is <strong>past_due</strong>. Billing features are locked until payment is updated.{" "}
              <Link href="/author/billing" className="underline">
                Manage subscription
              </Link>
              .
            </p>
          </div>
        )}

        <nav className="mb-8 flex flex-wrap gap-1 rounded-full border border-black/[0.06] bg-slate-100/80 p-1 backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.04] w-fit" aria-label="Book editor: choose view">
          <Link
            href={`/author/books/${book.id}${activeVersion ? `?lang=${normalizeLangKey(activeVersion.language_code)}` : ""}`}
            className={`rounded-full px-5 py-2 text-[13px] font-medium transition-all ${
              editorPanel === "editor"
                ? "bg-white text-slate-900 shadow-sm dark:bg-white/[0.12] dark:text-white"
                : "text-slate-500 hover:text-slate-700 dark:text-white/50 dark:hover:text-white/80"
            }`}
          >
            Manuscript
          </Link>
          <Link
            href={`/author/books/${book.id}?panel=pricing${activeVersion ? `&lang=${normalizeLangKey(activeVersion.language_code)}` : ""}`}
            className={`rounded-full px-5 py-2 text-[13px] font-medium transition-all ${
              editorPanel === "pricing"
                ? "bg-white text-slate-900 shadow-sm dark:bg-white/[0.12] dark:text-white"
                : "text-slate-500 hover:text-slate-700 dark:text-white/50 dark:hover:text-white/80"
            }`}
          >
            Pricing and distribution
          </Link>
          <Link
            href={`/author/books/${book.id}?panel=import${activeVersion ? `&lang=${normalizeLangKey(activeVersion.language_code)}` : ""}`}
            className={`rounded-full px-5 py-2 text-[13px] font-medium transition-all ${
              editorPanel === "import"
                ? "bg-white text-slate-900 shadow-sm dark:bg-white/[0.12] dark:text-white"
                : "text-slate-500 hover:text-slate-700 dark:text-white/50 dark:hover:text-white/80"
            }`}
          >
            Import manuscript
          </Link>
        </nav>

        {editorPanel === "pricing" && (
          <div className="max-w-2xl space-y-6">
            <h2 className="text-[clamp(20px,2.5vw,24px)] font-bold tracking-[-0.02em] text-slate-900 dark:text-white">Pricing and distribution</h2>

            <div className="rounded-2xl border border-black/[0.05] bg-white/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.02)] backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02] dark:shadow-none space-y-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Price and currency</h3>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm text-slate-700 dark:text-white/80">Free</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={priceAmountMinor > 0}
                  aria-label="Book free or paid"
                  onClick={() => setPriceAmountMinor(priceAmountMinor > 0 ? 0 : 4900)}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-[#907AFF]/50 ${
                    priceAmountMinor > 0 ? "bg-[#907AFF]" : "bg-slate-200 dark:bg-slate-600"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                      priceAmountMinor > 0 ? "translate-x-5" : "translate-x-1"
                    }`}
                  />
                </button>
                <span className="text-sm text-slate-700 dark:text-white/80">Paid</span>
              </div>
              {priceAmountMinor > 0 && (
                <div className="flex flex-wrap gap-4 pt-2">
                  <div>
                    <label htmlFor="price-amount" className="mb-1 block text-xs text-slate-500 dark:text-white/50">Price (shown to readers)</label>
                    <input
                      id="price-amount"
                      type="number"
                      min={0}
                      step={1}
                      value={priceAmountMinor / 100}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        if (!Number.isFinite(v) || v < 0) return;
                        setPriceAmountMinor(Math.round(v * 100));
                      }}
                      aria-label="Price in currency"
                      className="w-28 rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white"
                    />
                  </div>
                  <div>
                    <label htmlFor="price-currency" className="mb-1 block text-xs text-slate-500 dark:text-white/50">Currency</label>
                    <select
                      id="price-currency"
                      value={priceCurrency}
                      onChange={(e) => setPriceCurrency(e.target.value)}
                      aria-label="Currency"
                      className="rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white"
                    >
                      <option value="SEK">SEK</option>
                      <option value="EUR">EUR</option>
                      <option value="USD">USD</option>
                    </select>
                  </div>
                </div>
              )}
              <p className="text-xs text-slate-500 dark:text-white/50">Price is stored in minor units (cents/ore). Here it is shown as whole currency units.</p>
            </div>

            <div className="rounded-2xl border border-black/[0.05] bg-white/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.02)] backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02] dark:shadow-none space-y-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Sales model</h3>
              <div className="flex items-center gap-3 rounded-lg border border-[#907AFF]/30 bg-[#907AFF]/10 px-3 py-2 dark:bg-[#907AFF]/15">
                <span className="text-sm font-medium text-slate-900 dark:text-white">Full book</span>
                <span className="rounded-full bg-[#907AFF]/20 px-2 py-0.5 text-xs font-medium text-[#5c4bb8] dark:text-[#b8a9ff]">Selected</span>
              </div>
              <div className="flex items-center gap-3 rounded-lg border border-black/[0.06] bg-slate-50/50 px-3 py-2 dark:border-white/[0.06] dark:bg-white/5">
                <span className="text-sm text-slate-600 dark:text-white/60">Chapter</span>
                <span className="text-xs text-slate-500 dark:text-white/50">Coming later</span>
              </div>
              <div className="flex items-center gap-3 rounded-lg border border-black/[0.06] bg-slate-50/50 px-3 py-2 dark:border-white/[0.06] dark:bg-white/5">
                <span className="text-sm text-slate-600 dark:text-white/60">Bundle</span>
                <span className="text-xs text-slate-500 dark:text-white/50">Coming later</span>
              </div>
            </div>

            <div className="rounded-2xl border border-black/[0.05] bg-white/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.02)] backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02] dark:shadow-none">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Visibility and access</h3>
              <p className="text-sm text-slate-700 dark:text-white/80">
                {priceAmountMinor <= 0
                  ? "Free - everyone can read the book."
                  : "Paid - readers need to purchase the book or have access via entitlement to read."}
                {" "}
                {currentVisibility === "followers" && "Followers-only affects discoverability, not the paywall."}
              </p>
            </div>

            {!isPublished && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/30" role="status">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Publish the book before selling it.</p>
              </div>
            )}
            {priceAmountMinor > 0 && !stripeConfigured && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/30" role="status">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Payment configuration is missing. Contact us to enable purchases.</p>
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleSavePricing}
                disabled={pricingSaving || (priceAmountMinor === initialPriceMinor && priceCurrency === initialCurrency)}
                aria-label="Save pricing"
                className="rounded-xl bg-slate-900 px-4 py-2.5 text-[13px] font-semibold text-white shadow-sm transition-all hover:bg-slate-800 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed dark:bg-white dark:text-slate-900"
              >
                {pricingSaving ? "Saving..." : "Save"}
              </button>
              {pricingError && <p className="text-sm text-red-600 dark:text-red-400" role="alert">{pricingError}</p>}
              {pricingSaved && <p className="text-sm text-emerald-600 dark:text-emerald-400" role="status">Saved.</p>}
            </div>
          </div>
        )}

        {editorPanel === "import" && (
          <ImportManusSection
            bookId={book.id}
            bookVersionId={activeVersion?.id ?? null}
            refetchJobs={refetchBookJob}
            importJobs={importJobs}
          />
        )}

        {editorPanel === "editor" && (
        <>
        <div className="mb-4 flex flex-wrap items-end gap-3">
          {getTranslationsEnabled() && bookVersions.length > 1 && (
            <div className="min-w-[220px] max-w-[320px]">
              <label htmlFor="version-select" className="mb-1 block text-xs text-slate-500 dark:text-white/50">
                Working version
              </label>
              <select
                id="version-select"
                value={normalizeLangKey(activeVersion?.language_code ?? activeLanguage)}
                onChange={(e) => router.push(`/author/books/${book.id}?lang=${e.target.value}`)}
                className="w-full rounded-xl border border-black/[0.08] bg-white px-4 py-2.5 text-[13px] font-medium text-slate-900 shadow-sm focus:border-black/[0.15] focus:shadow-md focus:outline-none dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white"
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
          <span className="rounded-full border border-black/[0.05] bg-slate-50/80 px-3 py-1 text-[11px] font-medium text-slate-400 backdrop-blur-sm dark:border-white/[0.05] dark:bg-white/[0.02] dark:text-white/35">
            Version: {getLanguageLabel(activeLanguage)}
          </span>
        </div>
        <div className="mb-6 grid gap-6 rounded-3xl border border-black/[0.06] bg-white/70 p-5 shadow-[0_6px_24px_rgba(15,23,42,0.05)] backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02] dark:shadow-none lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
          <div className="min-w-0">
            {!isRenamingBook ? (
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-[clamp(28px,3.5vw,38px)] font-bold tracking-[-0.03em] text-slate-900 dark:text-white">
                  {bookTitle}
                </h1>
                <span
                  className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                    isPublished
                      ? "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-400/15 dark:text-emerald-400"
                      : "bg-slate-100 text-slate-500 dark:bg-white/[0.06] dark:text-white/50"
                  }`}
                >
                    {isPublished ? "Published" : "Draft"}
                </span>
                {isPublished && (
                  <span className="rounded-full border border-black/[0.06] bg-white/80 px-3 py-1 text-[11px] font-medium text-slate-500 backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.04] dark:text-white/50">
                    {currentVisibilityLabel}
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleStartRenameBook}
                  className="rounded-full border border-black/[0.06] bg-white/80 px-3.5 py-1.5 text-[11px] font-medium text-slate-500 backdrop-blur-sm transition-all hover:border-black/[0.12] hover:text-slate-900 dark:border-white/[0.06] dark:bg-white/[0.04] dark:text-white/50 dark:hover:border-white/[0.12] dark:hover:text-white"
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
                    className="min-w-[260px] rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-base text-slate-900 focus:border-slate-500 focus:outline-none dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={handleSaveRenameBook}
                    disabled={bookTitleSaving}
                    className="rounded-xl bg-slate-900 px-4 py-2.5 text-[13px] font-medium text-white shadow-sm hover:bg-slate-800 hover:shadow-md disabled:opacity-60 dark:bg-white dark:text-slate-900"
                  >
                    {bookTitleSaving ? "Saving..." : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelRenameBook}
                    className="rounded-xl border border-black/[0.08] px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-white/[0.08] dark:text-white/70 dark:hover:bg-white/[0.04]"
                  >
                    Cancel
                  </button>
                </div>
                {bookTitleError && (
                  <p className="text-xs text-red-600 dark:text-red-400">{bookTitleError}</p>
                )}
              </div>
            )}
            <p className="mt-2.5 text-[13px] text-slate-400 dark:text-white/40">
              {isPublished ? currentVisibilitySummary : "Draft - not visible to readers yet"} · {chapters.length} chapters
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 lg:justify-self-end">
            <div className="relative">
              <button
                ref={publishMenuButtonRef}
                type="button"
                onClick={() => setPublishMenuOpen((prev) => !prev)}
                aria-expanded={publishMenuOpen}
                className={publishButtonClass}
              >
                Publish
                <svg
                  className={`h-3.5 w-3.5 transition-transform ${publishMenuOpen ? "rotate-180" : ""}`}
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 4.5L6 7.5L9 4.5" />
                </svg>
              </button>

              {publishMenuOpen && (
                <div
                  ref={publishMenuRef}
                  className="absolute right-0 z-[200] mt-3 w-[360px] rounded-2xl border border-black/[0.06] bg-white/95 p-5 shadow-2xl backdrop-blur-xl dark:border-white/[0.06] dark:bg-[#0b0b12]/95"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Publish</h2>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        isPublished
                          ? "bg-[#907AFF]/15 text-[#5c4bb8] dark:bg-[#907AFF]/25 dark:text-[#b8a9ff]"
                          : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-white/70"
                      }`}
                    >
                      {isPublished ? "Published" : "Draft"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-white/50">
                    Publishing settings for this version. Drafts are private until you publish.
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-white/50">
                    <span>{isPublished ? currentVisibilitySummary : "Not visible to readers yet."}</span>
                    {isPublished && (
                      <span className="rounded-full border border-black/[0.06] bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:border-white/[0.06] dark:bg-white/5 dark:text-white/70">
                        {currentVisibilityLabel}
                      </span>
                    )}
                    {isPublished && (
                      <span className="rounded-full border border-black/[0.06] bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:border-white/[0.06] dark:bg-white/5 dark:text-white/70">
                        Chapters live: {publishedChapterCount ?? chapters.length}/{chapters.length}
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
                              ? "border-[#907AFF]/50 bg-[#907AFF]/10 dark:border-[#907AFF]/50 dark:bg-[#907AFF]/15"
                              : "border-black/[0.06] bg-white/70 hover:bg-white dark:border-white/[0.06] dark:bg-white/5 dark:hover:bg-white/10"
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
                            className="mt-1 h-4 w-4 accent-[#907AFF]"
                          />
                          <div>
                            <p className="text-sm font-medium text-slate-900 dark:text-white">{option.label}</p>
                            <p className="text-xs text-slate-500 dark:text-white/50">{option.description}</p>
                          </div>
                        </label>
                      );
                    })}
                  </fieldset>

                  {getRecommendationsEnabled() && (
                    <GenreSelector bookId={book.id} />
                  )}

                  {!isPublished && missingPublishRequirements.length > 0 && (
                    <div className="mt-4 rounded-lg border border-[#907AFF]/40 bg-[#907AFF]/10 px-3 py-3 text-xs text-[#5c4bb8] dark:border-[#907AFF]/30 dark:bg-[#907AFF]/15 dark:text-[#b8a9ff]">
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
                    <div className="mt-4 rounded-lg border border-black/[0.06] bg-white px-3 py-3 text-xs text-slate-700 dark:border-white/[0.06] dark:bg-white/5 dark:text-white/70">
                      <p className="mb-1 font-semibold text-slate-900 dark:text-white">Confirm</p>
                      <p className="text-xs text-slate-600 dark:text-white/60">{confirmCopy}</p>
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => handlePublishAction(confirmPublishAction)}
                          disabled={isPublishing}
                          className="rounded-lg bg-[#907AFF] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#7c6ae6] disabled:opacity-60"
                        >
                          {isPublishing ? "Working..." : "Confirm"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmPublishAction(null)}
                          className="rounded-xl border border-black/[0.08] px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/[0.08] dark:text-white/70 dark:hover:bg-white/[0.04]"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 flex flex-col gap-2">
                      {!isPublished && (
                        <>
                          <button
                            type="button"
                            onClick={() => setConfirmPublishAction("publish")}
                            disabled={publishDisabled}
                            className="rounded-lg bg-[#907AFF] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#7c6ae6] disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isPublishing ? "Publishing..." : "Publish full book"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handlePublishSelectedChapter()}
                            disabled={chapterPublishDisabled}
                            className="rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white dark:hover:bg-white/[0.06]"
                          >
                            {isPublishing
                              ? "Publishing..."
                              : selectedChapterAlreadyPublished
                                ? "Selected chapter already live"
                                : "Publish selected chapter"}
                          </button>
                        </>
                      )}
                      {isPublished && (
                        <>
                          <button
                            type="button"
                            onClick={() => void handlePublishSelectedChapter()}
                            disabled={chapterPublishDisabled}
                            className="rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white dark:hover:bg-white/[0.06]"
                          >
                            {isPublishing
                              ? "Publishing..."
                              : selectedChapterAlreadyPublished
                                ? "Selected chapter already live"
                                : "Release selected chapter"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmPublishAction("update")}
                            disabled={isPublishing || !visibilityChanged}
                            className="rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white dark:hover:bg-white/[0.06]"
                          >
                            {isPublishing ? "Updating..." : "Update publishing settings"}
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
              )}
            </div>
            {getMarketingEnabled() && (
              <Link
                href={`/author/marketing?bookId=${book.id}`}
                className="rounded-full border border-black/[0.08] bg-white/80 px-5 py-2.5 text-[13px] font-medium text-slate-700 backdrop-blur-sm transition-all hover:border-black/[0.14] hover:bg-slate-50 hover:text-slate-900 dark:border-white/[0.12] dark:bg-white/[0.03] dark:text-white/85 dark:hover:bg-white/[0.06]"
              >
                Promote
              </Link>
            )}
            <DeleteBookButton
              bookId={book.id}
              bookTitle={bookTitle}
              redirectTo="/author/books"
              className="rounded-full border border-red-200/60 bg-white/80 px-5 py-2.5 text-[13px] font-medium text-red-500 backdrop-blur-sm transition-all hover:border-red-300 hover:bg-red-50 hover:text-red-700 dark:border-red-900/30 dark:bg-white/[0.03] dark:text-red-400 dark:hover:bg-red-950/20"
            />
          </div>
        </div>

        <div className="mb-6 rounded-2xl border border-black/[0.06] bg-white/75 p-4 shadow-[0_4px_18px_rgba(15,23,42,0.04)] backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02] dark:shadow-none">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
            <div>
              <label htmlFor="chapter-select" className="mb-1 block text-xs text-slate-500 dark:text-white/50">
                Current chapter
              </label>
              <div className="relative">
                <select
                  id="chapter-select"
                  value={selectedChapterId ?? ""}
                  onChange={(e) => {
                    setSelectedChapterId(e.target.value || null);
                    setSessionStartWords(null);
                  }}
                  className="h-11 w-full appearance-none rounded-xl border border-black/[0.08] bg-white px-4 pr-10 text-[13px] font-medium text-slate-900 shadow-sm transition-all focus:border-black/[0.15] focus:shadow-md focus:outline-none dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white"
                >
                  {chapters.length === 0 && <option value="">No chapters yet</option>}
                  {chapters.map((chapter) => (
                    <option key={chapter.id} value={chapter.id}>
                      {chapter.title}
                    </option>
                  ))}
                </select>
                <svg
                  className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 dark:text-white/60"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M6 8l4 4 4-4" />
                </svg>
              </div>
            </div>
            <button
              type="button"
              onClick={handleCreateChapter}
              disabled={isCreating}
              className="h-11 rounded-xl bg-slate-900 px-4 text-[13px] font-semibold text-white shadow-sm transition-all hover:bg-slate-800 hover:shadow-md disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-white/90"
            >
              {isCreating ? "Creating..." : "+ New chapter"}
            </button>
            <button
              type="button"
              onClick={() => coverInputRef.current?.click()}
              disabled={coverUploading}
              className="h-11 rounded-xl border border-black/[0.08] bg-white px-4 text-[13px] font-medium text-slate-600 shadow-sm transition-all hover:border-black/[0.12] hover:shadow-md disabled:opacity-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white/70 dark:hover:bg-white/[0.06]"
            >
              {coverUploading ? "Uploading..." : "Upload cover"}
            </button>
          </div>
          {coverError && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400" role="alert">
              {coverError}
            </p>
          )}
        </div>

        <div className="grid gap-8 lg:grid-cols-[300px_minmax(0,1fr)]">
          <div className="space-y-4 lg:sticky lg:top-28 lg:self-start">
            <div className="rounded-2xl border border-black/[0.05] bg-white/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.02)] backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02] dark:shadow-none">
              <h2 className="mb-3 text-[14px] font-semibold tracking-[-0.01em] text-slate-800 dark:text-white/90">Cover</h2>
              <div className="space-y-2">
                <div className="relative aspect-[3/4] overflow-hidden rounded-xl border border-black/[0.06] bg-slate-50 shadow-sm dark:border-white/[0.06] dark:bg-white/[0.02]">
                  {displayCoverUrl ? (
                    <Image
                      src={displayCoverUrl}
                      alt="Book cover"
                      fill
                      sizes="(min-width: 1024px) 280px, 100vw"
                      className="object-cover transition-transform hover:scale-[1.02]"
                      unoptimized
                    />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-slate-300 dark:text-white/20">
                      <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
                      </svg>
                      <span className="text-[12px]">No cover image</span>
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
              </div>
            </div>

            <div className="rounded-2xl border border-black/[0.05] bg-white/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.02)] backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02] dark:shadow-none">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-slate-800 dark:text-white/90">Chapters</h2>
                <span className="text-[11px] text-slate-400 dark:text-white/40">
                  {isPublished
                    ? `${publishedChapterCount ?? chapters.length}/${chapters.length} live`
                    : `${chapters.length} total`}
                </span>
              </div>
              <div className="max-h-[46vh] space-y-1 overflow-y-auto pr-1">
                {chapters.length === 0 && (
                  <p className="text-xs text-slate-400 dark:text-white/40">No chapters yet</p>
                )}
                {chapters.map((chapter) => {
                  const chapterOrder = typeof chapter.order === "number" ? chapter.order : -1;
                  const isChapterPublished =
                    isPublished && (publishedChapterCount === null || chapterOrder < (publishedChapterCount ?? 0));
                  const isSelected = chapter.id === selectedChapterId;
                  const isNextToPublish =
                    isPublished &&
                    publishedChapterCount !== null &&
                    chapterOrder === publishedChapterCount;
                  const canToggle =
                    !isPublishing &&
                    isPublished &&
                    (isChapterPublished
                      ? publishedChapterCount === null || chapterOrder === (publishedChapterCount ?? 0) - 1
                      : isNextToPublish || !isPublished);
                  return (
                    <div
                      key={chapter.id}
                      className={`group flex items-center gap-2 rounded-lg px-2 py-1.5 transition ${
                        isSelected
                          ? "bg-[#907AFF]/10 dark:bg-[#907AFF]/15"
                          : "hover:bg-slate-50 dark:hover:bg-white/[0.04]"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedChapterId(chapter.id);
                          setSessionStartWords(null);
                        }}
                        className="min-w-0 flex-1 truncate text-left text-[12px] font-medium text-slate-700 dark:text-white/80"
                        title={chapter.title}
                      >
                        {chapter.title}
                      </button>
                      {isPublished && (
                        <button
                          type="button"
                          disabled={!canToggle || isPublishing}
                          onClick={() => void handleChapterPublishToggle(chapter, !isChapterPublished)}
                          title={
                            isChapterPublished
                              ? canToggle
                                ? "Unpublish this chapter"
                                : "Unpublish later chapters first"
                              : canToggle
                                ? "Publish this chapter"
                                : "Publish earlier chapters first"
                          }
                          className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold transition ${
                            isChapterPublished
                              ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:hover:bg-emerald-900/50"
                              : canToggle
                                ? "bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-white/10 dark:text-white/50 dark:hover:bg-white/15"
                                : "bg-slate-50 text-slate-300 dark:bg-white/5 dark:text-white/20"
                          } disabled:cursor-not-allowed disabled:opacity-50`}
                        >
                          {isChapterPublished ? "Live" : "Draft"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {getTranslationsEnabled() && (
              <div className="rounded-2xl border border-black/[0.05] bg-white/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.02)] backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02] dark:shadow-none">
                <h2 className="mb-3 text-[14px] font-semibold tracking-[-0.01em] text-slate-800 dark:text-white/90">Translation</h2>
                <p className="mb-3 text-xs text-slate-500 dark:text-white/50">
                  Create a new language version of this book. The translation appears when complete.
                </p>
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-500 dark:text-white/50">Status:</span>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      translationUiStatus === "translating"
                        ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200"
                        : translationUiStatus === "done"
                          ? "bg-[#907AFF]/15 text-[#5c4bb8] dark:bg-[#907AFF]/25 dark:text-[#b8a9ff]"
                          : translationUiStatus === "error"
                            ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200"
                            : "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
                    }`}
                    role="status"
                  >
                    {translationUiStatus === "idle" && STATUS_LABELS.idle}
                    {translationUiStatus === "translating" && "Translating..."}
                    {translationUiStatus === "done" && STATUS_LABELS.completed}
                    {translationUiStatus === "error" && STATUS_LABELS.failed}
                  </span>
                </div>
                {(translationUiStatus === "translating" || isPollingCurrent) && translationProgress && translationProgress.total > 0 && (
                  <div className="mb-3" role="progressbar" aria-label="Translation progress" aria-valuenow={translationProgress.translated} aria-valuemin={0} aria-valuemax={translationProgress.total}>
                    <div className="mb-1 flex items-center justify-between text-xs text-slate-500 dark:text-white/50">
                      <span>
                        {translationProgress.translated} of {translationProgress.total} chapters
                      </span>
                      <span>
                        {Math.round((translationProgress.translated / translationProgress.total) * 100)}%
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                      <div
                        className="h-full rounded-full bg-blue-500 transition-[width] duration-300 dark:bg-blue-400"
                        style={{ width: `${Math.min(100, (translationProgress.translated / translationProgress.total) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}
                {translationUiStatus === "error" && currentTargetVersion?.error_message && (
                  <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200" role="alert">
                    {currentTargetVersion.error_message}
                  </p>
                )}
                <label htmlFor="translate-language" className="mb-1 block text-xs text-slate-500 dark:text-white/50">Target language</label>
                <select
                  id="translate-language"
                  value={translateTargetLanguage}
                  onChange={(e) => setTranslateTargetLanguage(e.target.value as SupportedLanguage)}
                  className="mb-3 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white"
                >
                  {LANGUAGE_OPTIONS.filter((opt) => opt.value !== translationSourceLang).map((opt) => {
                    const supported = isTranslationPairSupported(translationSourceLang, opt.value);
                    return (
                      <option key={opt.value} value={opt.value} disabled={!supported}>
                        {opt.label}{supported ? "" : " (not available)"}
                      </option>
                    );
                  })}
                </select>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => void handleStartTranslation("book")}
                    disabled={isStartingTranslation || isProFeatureLocked || !isTranslationPairSupported(translationSourceLang, translateTargetLanguage)}
                    className="w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white dark:hover:bg-white/[0.06]"
                  >
                    {isStartingTranslation
                      ? "Starting..."
                      : isProFeatureLocked
                        ? billing.loading
                          ? "Checking subscription..."
                          : billing.pastDue
                            ? "Locked: payment required"
                            : "Translate full book (Pro)"
                        : translationUiStatus === "error"
                          ? "Retry full translation"
                          : "Translate full book"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleStartTranslation("chapter")}
                    disabled={
                      isStartingTranslation ||
                      isProFeatureLocked ||
                      !selectedChapterId ||
                      !isTranslationPairSupported(translationSourceLang, translateTargetLanguage)
                    }
                    className="w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white dark:hover:bg-white/[0.06]"
                  >
                    {isStartingTranslation
                      ? "Starting..."
                      : !selectedChapterId
                        ? "Select chapter first"
                        : isProFeatureLocked
                          ? billing.loading
                            ? "Checking subscription..."
                            : billing.pastDue
                              ? "Locked: payment required"
                              : "Translate chapter (Pro)"
                          : "Translate selected chapter"}
                  </button>
                </div>
                {isProFeatureLocked && (
                  <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
                    {proFeatureLockMessage}{" "}
                    {!billing.loading && (
                      <Link href="/author/billing" className="underline">
                        Manage subscription
                      </Link>
                    )}
                  </div>
                )}
                {currentTargetVersion && (
                  <button
                    type="button"
                    onClick={() =>
                      router.push(`/author/books/${book.id}?lang=${normalizeLangKey(currentTargetVersion.language_code)}`)
                    }
                    className="mt-2 w-full rounded-xl bg-slate-900 px-4 py-2.5 text-[13px] font-medium text-white shadow-sm transition-all hover:bg-slate-800 hover:shadow-md dark:bg-white dark:text-slate-900 dark:hover:bg-white/90"
                  >
                    Open version
                  </button>
                )}
                {translationQueueHealthy === false && (
                  <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
                    Translation queue is offline right now.
                  </div>
                )}
                {translateMessage && (
                  <div
                    className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
                      translationUiStatus === "done" || translateMessage.toLowerCase().includes("klar")
                        ? "border-[#907AFF]/40 bg-[#907AFF]/10 text-[#5c4bb8] dark:border-[#907AFF]/40 dark:bg-[#907AFF]/15 dark:text-[#b8a9ff]"
                        : translationUiStatus === "error"
                          ? "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200"
                          : "border-black/[0.06] bg-slate-50 text-slate-800 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-200"
                    }`}
                    role="status"
                  >
                    {translateMessage}
                  </div>
                )}
              </div>
            )}

            <div className="rounded-2xl border border-black/[0.05] bg-white/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.02)] backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02] dark:shadow-none">
              <h2 className="mb-3 text-[14px] font-semibold tracking-[-0.01em] text-slate-800 dark:text-white/90">Original</h2>
              <label htmlFor="original-url-editor" className="mb-1 block text-xs text-slate-500 dark:text-white/50">Original is available on Amazon</label>
              <input
                id="original-url-editor"
                type="url"
                value={originalUrl}
                onChange={(e) => setOriginalUrl(e.target.value)}
                onBlur={handleOriginalUrlBlur}
                placeholder="https://..."
                className="w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white dark:placeholder:text-white/40"
              />
            </div>

            <div id="audiobook" className="rounded-2xl border border-black/[0.05] bg-white/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.02)] backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02] dark:shadow-none">
              <h2 className="mb-2 text-[14px] font-semibold tracking-[-0.01em] text-slate-800 dark:text-white/90">Audiobook</h2>
              <div className="mb-2 flex items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    audiobookStatusUi === "published"
                      ? "bg-[#907AFF]/15 text-[#5c4bb8] dark:bg-[#907AFF]/25 dark:text-[#b8a9ff]"
                      : audiobookStatusUi === "paused" || audiobookStatusUi === "pause_requested"
                        ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                      : audiobookStatusUi === "cancel_requested"
                        ? "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300"
                      : audiobookStatusUi === "generating" || audiobookStatusUi === "queued"
                        ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                        : audiobookStatusUi === "cancelled"
                          ? "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
                        : audiobookStatusUi === "failed"
                          ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                          : "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
                  }`}
                >
                  {getAudiobookStatusLabel(audiobookStatusUi)}
                </span>
              </div>

              {isAudiobookActive && effectiveAudiobookProgress && (
                <div className="mb-3">
                  <div className="mb-1 flex justify-between text-xs text-slate-600 dark:text-slate-400">
                    <span>{effectiveAudiobookProgress.currentChapterTitle ?? "Processing..."}</span>
                    <span>{effectiveAudiobookProgress.completedChapters} / {effectiveAudiobookProgress.totalChapters}</span>
                  </div>
                  <p className="mb-1 text-[11px] text-slate-500 dark:text-slate-400">
                    Scope: {activeAudiobookScopeSummary}
                  </p>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                    <div
                      className="h-full rounded-full bg-[#907AFF] transition-all duration-300"
                      style={{
                        width: effectiveAudiobookProgress.totalChapters > 0
                          ? `${(effectiveAudiobookProgress.completedChapters / effectiveAudiobookProgress.totalChapters) * 100}%`
                          : "0%",
                      }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    {audiobookEtaText ?? "Estimating remaining time..."}
                  </p>
                </div>
              )}

              <div className="mb-3 grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setAudiobookScope("book")}
                  className={`rounded-xl border px-2 py-2 text-xs font-medium transition ${
                    audiobookScope === "book"
                      ? "border-[#907AFF]/40 bg-[#907AFF]/10 text-[#5c4bb8] dark:border-[#907AFF]/50 dark:bg-[#907AFF]/20 dark:text-[#c5b9ff]"
                      : "border-black/[0.08] bg-white text-slate-600 hover:bg-slate-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white/80"
                  }`}
                >
                  Full book
                </button>
                <button
                  type="button"
                  onClick={() => setAudiobookScope("current")}
                  className={`rounded-xl border px-2 py-2 text-xs font-medium transition ${
                    audiobookScope === "current"
                      ? "border-[#907AFF]/40 bg-[#907AFF]/10 text-[#5c4bb8] dark:border-[#907AFF]/50 dark:bg-[#907AFF]/20 dark:text-[#c5b9ff]"
                      : "border-black/[0.08] bg-white text-slate-600 hover:bg-slate-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white/80"
                  }`}
                >
                  Current chapter
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAudiobookScope("selected");
                    setIsAudiobookChapterPickerOpen(true);
                    if (selectedChapterId) {
                      setAudiobookSelectedChapterIds((prev) => (
                        prev.includes(selectedChapterId) ? prev : [...prev, selectedChapterId]
                      ));
                    }
                  }}
                  className={`rounded-xl border px-2 py-2 text-xs font-medium transition ${
                    audiobookScope === "selected"
                      ? "border-[#907AFF]/40 bg-[#907AFF]/10 text-[#5c4bb8] dark:border-[#907AFF]/50 dark:bg-[#907AFF]/20 dark:text-[#c5b9ff]"
                      : "border-black/[0.08] bg-white text-slate-600 hover:bg-slate-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white/80"
                  }`}
                >
                  Choose chapters
                </button>
              </div>

              <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
                Selection: {audiobookSelectionSummary}
              </p>

              {audiobookScope === "selected" && (
                <div className="mb-3 rounded-xl border border-black/[0.08] bg-white/70 p-3 dark:border-white/[0.08] dark:bg-white/[0.03]">
                  <button
                    type="button"
                    onClick={() => setIsAudiobookChapterPickerOpen((prev) => !prev)}
                    className="mb-2 w-full rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-left text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white"
                  >
                    {isAudiobookChapterPickerOpen ? "Hide chapter list" : "Show chapter list"}
                  </button>
                  {isAudiobookChapterPickerOpen && (
                    <>
                      <div className="mb-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setAudiobookSelectedChapterIds(chapters.map((chapter) => chapter.id))}
                          className="rounded-md border border-black/[0.08] px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50 dark:border-white/[0.08] dark:text-white/80 dark:hover:bg-white/[0.06]"
                        >
                          Select all
                        </button>
                        <button
                          type="button"
                          onClick={() => setAudiobookSelectedChapterIds([])}
                          className="rounded-md border border-black/[0.08] px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50 dark:border-white/[0.08] dark:text-white/80 dark:hover:bg-white/[0.06]"
                        >
                          Clear
                        </button>
                      </div>
                      <div className="max-h-44 space-y-1 overflow-y-auto pr-1">
                        {chapters.map((chapter) => {
                          const checked = audiobookSelectedChapterIds.includes(chapter.id);
                          return (
                            <label
                              key={chapter.id}
                              className="flex cursor-pointer items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-xs text-slate-700 hover:border-black/[0.05] hover:bg-slate-50 dark:text-white/80 dark:hover:border-white/[0.08] dark:hover:bg-white/[0.05]"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  setAudiobookSelectedChapterIds((prev) => (
                                    prev.includes(chapter.id)
                                      ? prev.filter((id) => id !== chapter.id)
                                      : [...prev, chapter.id]
                                  ));
                                }}
                                className="h-3.5 w-3.5 rounded border-black/[0.2] text-[#907AFF] focus:ring-[#907AFF]"
                              />
                              <span className="truncate">{chapter.title || "Untitled chapter"}</span>
                            </label>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}

              <div className="mb-2 grid grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={() => void handleGenerateAudiobook()}
                  disabled={isAudiobookActive || !audiobookFeatureEnabled || isProFeatureLocked || (audiobookScope !== "book" && audiobookRequestedChapterIds.length === 0)}
                  className="w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white dark:hover:bg-white/[0.06]"
                >
                  {!audiobookFeatureEnabled
                    ? "Create audiobook (unavailable)"
                    : isProFeatureLocked
                    ? billing.loading
                      ? "Checking subscription..."
                      : billing.pastDue
                        ? "Locked: payment required"
                        : "Create full audiobook (Pro)"
                    : isAudiobookActive
                    ? effectiveAudiobookProgress
                      ? `Generating (${effectiveAudiobookProgress.completedChapters}/${effectiveAudiobookProgress.totalChapters})...`
                      : "Queued..."
                    : audiobookRequestScope === "book"
                      ? "Create full audiobook"
                      : audiobookRequestScope === "chapter"
                        ? "Generate selected chapter"
                        : `Generate ${audiobookRequestedChapterIds.length} chapters`}
                </button>
              </div>

              {isAudiobookActive && (
                <div className="mb-2 grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => void handleAudiobookControl("pause")}
                    disabled={!canPauseAudiobook}
                    className="rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white dark:hover:bg-white/[0.06]"
                  >
                    {audiobookControlPending === "pause" ? "Pausing..." : "Pause"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleAudiobookControl("resume")}
                    disabled={!canResumeAudiobook}
                    className="rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white dark:hover:bg-white/[0.06]"
                  >
                    {audiobookControlPending === "resume" ? "Resuming..." : "Resume"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleAudiobookControl("cancel")}
                    disabled={!canCancelAudiobook}
                    className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-950/50"
                  >
                    {audiobookControlPending === "cancel" ? "Stopping..." : "Cancel"}
                  </button>
                </div>
              )}

              {isAudiobookActive && (
                <p className="mb-2 text-[11px] text-slate-500 dark:text-slate-400">
                  Pause/cancel is applied safely between chapter boundaries.
                </p>
              )}

              {audiobookFeatureEnabled && isProFeatureLocked && (
                <div className="mb-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
                  {proFeatureLockMessage}{" "}
                  {!billing.loading && (
                    <Link href="/author/billing" className="underline">
                      Manage subscription
                    </Link>
                  )}
                </div>
              )}

              {!audiobookFeatureEnabled && (
                <p className="mb-2 text-xs text-slate-600 dark:text-white/60" role="status">
                  Audiobook generation is temporarily disabled because the worker is not compatible in this environment.
                </p>
              )}

              {selectedChapterId && (
                <div className="mb-2">
                  <ChapterAudiobookPlayer
                    bookId={book.id}
                    chapterId={selectedChapterId}
                    audiobookStatus={audiobookStatusUi}
                  />
                </div>
              )}

              {audiobookStatusUi === "cancelled" && (
                <p className="text-xs text-slate-600 dark:text-slate-300" role="status">
                  {effectiveAudiobookError ?? "Generation cancelled."}
                </p>
              )}

              {(audiobookStatusUi === "failed" || (effectiveAudiobookError && audiobookStatusUi !== "cancelled")) && (
                <p className="text-xs text-red-600 dark:text-red-400" role="alert">
                  {effectiveAudiobookError ?? "Could not create audiobook. Try again."}
                </p>
              )}
            </div>

            {getMarketingEnabled() && (
            <div id="marketing" className="rounded-2xl border border-black/[0.05] bg-white/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.02)] backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02] dark:shadow-none">
              <h2 className="mb-3 text-[14px] font-semibold tracking-[-0.01em] text-slate-800 dark:text-white/90">Launch copy</h2>
              <div className="mb-3 flex flex-wrap gap-2">
                <div className="flex flex-col gap-1">
                  <label htmlFor="marketing-channel" className="text-xs text-slate-500 dark:text-white/50">Channel</label>
                  <select
                    id="marketing-channel"
                    value={marketingChannel}
                    onChange={(e) => setMarketingChannel(e.target.value as MarketingChannel)}
                    className="rounded-xl border border-black/[0.08] bg-white px-2 py-1.5 text-sm text-slate-900 focus:border-slate-500 focus:outline-none dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white"
                  >
                    {MARKETING_CHANNELS.map((c) => (
                      <option key={c} value={c}>{MARKETING_CHANNEL_LABELS[c]}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="marketing-language" className="text-xs text-slate-500 dark:text-white/50">Language</label>
                  <select
                    id="marketing-language"
                    value={marketingLanguage}
                    onChange={(e) => setMarketingLanguage(e.target.value as SupportedLanguage)}
                    className="rounded-xl border border-black/[0.08] bg-white px-2 py-1.5 text-sm text-slate-900 focus:border-slate-500 focus:outline-none dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white"
                  >
                    {LANGUAGE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              {currentCampaign ? (
                <div className="mb-2 flex items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      currentCampaign.status === "generated" || currentCampaign.status === "published"
                        ? "bg-[#907AFF]/15 text-[#5c4bb8] dark:bg-[#907AFF]/25 dark:text-[#b8a9ff]"
                        : "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
                    }`}
                  >
                    {getMarketingCampaignStatusLabel(currentCampaign.status)}
                  </span>
                </div>
              ) : (
                <p className="mb-2 text-xs text-slate-500 dark:text-white/50">
                  No copy for this channel and language yet. Generate below.
                </p>
              )}
              <button
                type="button"
                onClick={handleGenerateMarketingCopy}
                disabled={isGeneratingMarketing || isProFeatureLocked}
                className="mb-3 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white dark:hover:bg-white/[0.06]"
              >
                {isGeneratingMarketing
                  ? "Generating..."
                  : isProFeatureLocked
                    ? billing.loading
                      ? "Checking subscription..."
                      : billing.pastDue
                        ? "Locked: payment required"
                        : "Generate launch copy (Pro required)"
                    : "Generate launch copy"}
              </button>
              {isProFeatureLocked && (
                <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
                  {proFeatureLockMessage}{" "}
                  {!billing.loading && (
                    <Link href="/author/billing" className="underline">
                      Manage subscription
                    </Link>
                  )}
                </div>
              )}
              {currentCampaign && (
                <div className="space-y-2">
                  {currentCampaign.headline && (
                    <p className="text-xs font-medium text-slate-500 dark:text-white/50">Headline</p>
                  )}
                  {currentCampaign.headline && (
                    <p className="whitespace-pre-wrap break-words rounded border border-black/[0.06] bg-white p-2 text-xs text-slate-700 dark:border-white/[0.06] dark:bg-white/5 dark:text-white/90">
                      {currentCampaign.headline}
                    </p>
                  )}
                  {currentCampaign.caption && (
                    <>
                      <p className="text-xs font-medium text-slate-500 dark:text-white/50">Copy</p>
                      <p className="whitespace-pre-wrap break-words rounded border border-black/[0.06] bg-white p-2 text-xs text-slate-700 dark:border-white/[0.06] dark:bg-white/5 dark:text-white/90">
                        {currentCampaign.caption}
                      </p>
                    </>
                  )}
                  {currentCampaign.cta && (
                    <>
                      <p className="text-xs font-medium text-slate-500 dark:text-white/50">Call to action</p>
                      <p className="rounded border border-black/[0.06] bg-white p-2 text-xs text-slate-700 dark:border-white/[0.06] dark:bg-white/5 dark:text-white/90">
                        {currentCampaign.cta}
                      </p>
                    </>
                  )}
                  {currentCampaign.hashtags && (
                    <>
                      <p className="text-xs font-medium text-slate-500 dark:text-white/50">Hashtags</p>
                      <p className="rounded border border-black/[0.06] bg-white p-2 text-xs text-slate-700 dark:border-white/[0.06] dark:bg-white/5 dark:text-white/90">
                        {currentCampaign.hashtags}
                      </p>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={handleCopyMarketingToClipboard}
                    className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-[13px] font-medium text-white shadow-sm transition-all hover:bg-slate-800 hover:shadow-md dark:bg-white dark:text-slate-900 dark:hover:bg-white/90"
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
                className="mt-1 block truncate text-xs text-[#5c4bb8] underline dark:text-[#b8a9ff]"
              >
                /reader/books/{book.id}
              </a>
            </div>
            )}

            {getMarketingEnabled() && (
              <div className="rounded-2xl border border-black/[0.05] bg-white/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.02)] backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02] dark:shadow-none">
                <h2 className="mb-3 text-[14px] font-semibold tracking-[-0.01em] text-slate-800 dark:text-white/90">Marketing portal</h2>
                {isPublished ? (
                  <>
                    <p className="mb-3 text-xs text-slate-500 dark:text-white/50">
                      Plan campaigns, generate copy, and manage distribution for this book.
                    </p>
                    <Link
                      href={`/author/marketing?bookId=${book.id}`}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-[#907AFF] to-[#7c6ae6] px-4 py-2.5 text-[13px] font-semibold text-white shadow-[0_1px_2px_rgba(144,122,255,0.3),inset_0_1px_0_rgba(255,255,255,0.15)] transition-all hover:shadow-[0_4px_12px_rgba(144,122,255,0.35)] hover:brightness-110"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M12.577 4.878a.75.75 0 01.919-.53l4.78 1.281a.75.75 0 01.531.919l-1.281 4.78a.75.75 0 01-1.449-.387l.81-3.022a19.407 19.407 0 00-5.594 5.203.75.75 0 01-1.139.093L7.55 10.81l-4.72 4.72a.75.75 0 01-1.06-1.06l5.25-5.25a.75.75 0 011.06 0l2.346 2.346a20.893 20.893 0 015.264-4.97l-2.633.706a.75.75 0 01-.919-.53z" clipRule="evenodd" />
                      </svg>
                      Open marketing portal
                    </Link>
                  </>
                ) : (
                  <p className="rounded-xl border border-dashed border-black/[0.08] bg-slate-50/50 px-3 py-3 text-center text-[12px] text-slate-400 dark:border-white/[0.06] dark:bg-white/[0.01] dark:text-white/30">
                    Publish the book to open the marketing portal
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="min-w-0">
            {selectedChapter ? (
              <>
                <div className="rounded-2xl border border-black/[0.06] bg-white/70 p-5 shadow-[0_4px_18px_rgba(15,23,42,0.04)] backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02] dark:shadow-none">
                <div className="mb-4 flex items-center justify-between">
                  {editingTitleId === selectedChapter.id ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        value={tempTitle}
                        onChange={(e) => setTempTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveTitle(selectedChapter.id);
                          if (e.key === "Escape") handleCancelEditTitle();
                        }}
                        className="min-w-[200px] rounded-xl border border-black/[0.08] bg-white px-4 py-2.5 text-base font-medium text-slate-900 shadow-sm focus:border-black/[0.15] focus:shadow-md focus:outline-none dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white"
                        autoFocus
                        aria-label="Chapter title"
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveTitle(selectedChapter.id)}
                        disabled={isSaving || !tempTitle.trim()}
                        className="rounded-xl bg-slate-900 px-4 py-2.5 text-[13px] font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-60 dark:bg-white dark:text-slate-900"
                      >
                        {isSaving ? "Saving..." : "Save"}
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelEditTitle}
                        className="rounded-xl border border-black/[0.08] px-4 py-2.5 text-[13px] font-medium text-slate-600 hover:bg-slate-50 dark:border-white/[0.08] dark:text-white/60 dark:hover:bg-white/[0.04]"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-3">
                        <h2 className="text-xl font-bold tracking-[-0.01em] text-slate-900 dark:text-white">{selectedChapter.title}</h2>
                        <button
                          type="button"
                          onClick={() => handleStartEditTitle(selectedChapter.id, selectedChapter.title)}
                          className="rounded-full border border-black/[0.06] bg-white/80 px-3 py-1 text-[11px] font-medium text-slate-400 backdrop-blur-sm transition-all hover:border-black/[0.12] hover:text-slate-700 dark:border-white/[0.06] dark:bg-white/[0.03] dark:text-white/40 dark:hover:text-white/70"
                        >
                          Rename
                        </button>
                      </div>
                      <p className="text-[12px] text-slate-400 dark:text-white/40">
                        {isSaving ? (
                          <span className="flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#907AFF]" />
                            Saving...
                          </span>
                        ) : lastSaved ? (
                          <span className="text-emerald-500/80 dark:text-emerald-400/70">
                            Last saved {lastSaved.toLocaleTimeString()}
                          </span>
                        ) : (
                          "Autosave active"
                        )}
                      </p>
                    </>
                  )}
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

                <div className="mt-4">
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
                </div>
              </>
            ) : (
              <div className="flex h-[500px] items-center justify-center rounded-2xl border border-dashed border-black/[0.08] bg-slate-50/30 dark:border-white/[0.06] dark:bg-white/[0.01]">
                <p className="text-[14px] text-slate-400 dark:text-white/40">
                  {chapters.length === 0 ? "Create your first chapter to start writing" : "Choose a chapter in the side panel"}
                </p>
              </div>
            )}
          </div>
        </div>
        </>
        )}
      </section>
      <CommandPalette open={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} commands={commands} />
    </>
  );
}
