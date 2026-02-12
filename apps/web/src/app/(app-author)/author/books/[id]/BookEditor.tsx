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
import { BookJobsBanner } from "@/components/books/JobStatusBanner";
import { useToastHelpers } from "@/components/ui/toast";
import { useBookJobs, type UnifiedJob } from "@/hooks/useBookJobs";
import { useBillingState } from "@/hooks/useBillingState";
import { resolveErrorMessage } from "@/lib/error-messages";
import { getAudiobookEnabled, getMarketingEnabled, getRecommendationsEnabled, getTranslationsEnabled } from "@/lib/flags";
import GenreSelector from "@/components/books/GenreSelector";
import TranslationPanel from "@/components/translations/TranslationPanel";
import { isJobActiveStatus, normalizeJobStatus } from "@/lib/job-status";
import { getLanguageLabel, LANGUAGE_OPTIONS, normalizeLanguage, type SupportedLanguage } from "@/lib/languages";
import { isTranslationPairSupported } from "@/lib/translation-pairs";

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
  public: "Publik",
  followers: "Bara följare",
  private: "Privat",
};

const PUBLISH_VISIBILITY_OPTIONS: Array<{
  value: PublishVisibility;
  label: string;
  description: string;
}> = [
  {
    value: "public",
    label: "Publik",
    description: "Synlig för alla. Visas i Utforska och på din profil.",
  },
  {
    value: "followers",
    label: "Bara följare",
    description: "Synlig bara för läsare som följer dig.",
  },
  {
    value: "private",
    label: "Privat",
    description: "Bara du kan se denna version.",
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
  if (value === "public") return "Synlig för alla";
  if (value === "followers") return "Synlig bara för följare";
  return "Bara du kan se denna version";
}

const MARKETING_CHANNELS = ["generic", "tiktok", "instagram", "x"] as const;
type MarketingChannel = (typeof MARKETING_CHANNELS)[number];

/** Användarvänliga etiketter för kanal (inga interna nycklar i UI) */
const MARKETING_CHANNEL_LABELS: Record<MarketingChannel, string> = {
  generic: "Allmän",
  tiktok: "TikTok",
  instagram: "Instagram",
  x: "X",
};

/** Status för visning: pending → running → completed / failed. Konsekvent copy i hela editorn. */
const STATUS_LABELS = {
  pending: "Väntar",
  running: "Pågår",
  completed: "Klar",
  failed: "Misslyckades",
  idle: "Väntar",
} as const;

function getAudiobookStatusLabel(status: string): string {
  if (status === "published" || status === "generated") return STATUS_LABELS.completed;
  if (status === "generating") return STATUS_LABELS.running;
  if (status === "failed") return STATUS_LABELS.failed;
  return "Ingen ljudbok än";
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
      setError(`Filtyper som stöds: ${IMPORT_ALLOWED_EXT.join(", ")}.`);
      setSelectedFile(null);
      return;
    }
    if (file.size > IMPORT_MAX_BYTES) {
      setError(`Max filstorlek är ${IMPORT_MAX_MB} MB.`);
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
      setError("Kunde inte starta import. Försök igen.");
    } finally {
      setUploading(false);
    }
  }, [selectedFile, uploading, bookId, bookVersionId, overwrite, refetchJobs]);

  const runChapterRepair = useCallback(async () => {
    if (repairing) return;
    if (!bookVersionId) {
      setRepairMessage("Ingen aktiv version hittades.");
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
        setRepairMessage(`Klart: ${updatedCount} kapitelrubriker reparerades.`);
      } else {
        setRepairMessage("Inget att reparera i denna version.");
      }
      router.refresh();
    } catch {
      setRepairMessage("Kunde inte reparera kapitelrubriker. Försök igen.");
    } finally {
      setRepairing(false);
    }
  }, [bookId, bookVersionId, repairing, router]);

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Importera manus</h2>
      <p className="text-sm text-slate-600 dark:text-white/60">
        Ladda upp en fil för att importera kapitel till denna bok. Stödda format: EPUB, DOCX, HTML, TXT, PDF. Max {IMPORT_MAX_MB} MB.
      </p>

      <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5 dark:border-white/10 dark:bg-white/5 space-y-4">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Importbeteende</h3>
        <div className="flex items-center gap-3">
          <input
            type="radio"
            id="import-new-version"
            name="import-mode"
            checked={!overwrite}
            onChange={() => setOverwrite(false)}
            aria-label="Importera som ny version"
            className="h-4 w-4 accent-[#907AFF]"
          />
          <label htmlFor="import-new-version" className="text-sm text-slate-700 dark:text-white/80">Importera som ny version</label>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="radio"
            id="import-overwrite"
            name="import-mode"
            checked={overwrite}
            onChange={() => setOverwrite(true)}
            aria-label="Skriv över utkast"
            className="h-4 w-4 accent-[#907AFF]"
          />
          <label htmlFor="import-overwrite" className="text-sm text-slate-700 dark:text-white/80">Skriv över utkast</label>
        </div>
        {overwrite && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200" role="alert">
            Import kan skriva över befintliga kapitel i denna version. Använd &quot;Importera som ny version&quot; om du vill behålla dem.
          </div>
        )}
      </div>

      <div
        className={`rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${
          selectedFile ? "border-[#907AFF]/40 bg-[#907AFF]/5 dark:bg-[#907AFF]/10" : "border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/5"
        }`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={IMPORT_ALLOWED_EXT.join(",")}
          className="hidden"
          aria-label="Välj fil att importera"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          disabled={uploading}
        />
        <p className="text-sm text-slate-600 dark:text-white/60 mb-2">
          Dra och släpp fil här, eller klicka för att välja. {IMPORT_ALLOWED_EXT.join(", ")} — max {IMPORT_MAX_MB} MB.
        </p>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
        >
          Välj fil
        </button>
        {selectedFile && (
          <p className="mt-3 text-sm font-medium text-slate-900 dark:text-white">
            Vald fil: {selectedFile.name}
          </p>
        )}
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>}

      <button
        type="button"
        onClick={startImport}
        disabled={!selectedFile || uploading}
        aria-label="Starta import"
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-white dark:text-slate-900"
      >
        {uploading ? "Startar import…" : "Starta import"}
      </button>

      <div className="rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 dark:border-white/10 dark:bg-white/5">
        <p className="text-sm font-medium text-slate-900 dark:text-white">Reparera befintlig import</p>
        <p className="mt-1 text-xs text-slate-600 dark:text-white/60">
          Kör detta om kapitelrubriker redan blivit fel (t.ex. dubblerade eller i konstig ordning).
        </p>
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={runChapterRepair}
            disabled={!bookVersionId || repairing || uploading}
            aria-label="Reparera kapitelrubriker"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
          >
            {repairing ? "Reparerar…" : "Reparera kapitelrubriker"}
          </button>
          {repairMessage && <p className="text-sm text-slate-700 dark:text-white/80">{repairMessage}</p>}
        </div>
      </div>

      {lastResult && !importJobs.some((j) => isJobActiveStatus(j.status)) && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-800 dark:bg-emerald-950/30">
          <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">Importen är påbörjad. Följ status i bannern ovan.</p>
          {lastResult.chaptersCreated != null && <p className="text-sm text-emerald-700 dark:text-emerald-300">Antal kapitel: {lastResult.chaptersCreated}</p>}
        </div>
      )}

      {visibleImportJobs.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Importstatus</h3>
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
                      : "border-slate-200 bg-slate-50/50 dark:border-white/10 dark:bg-white/5"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-900 dark:text-white">
                    {job.status === "pending" && "Väntar…"}
                    {job.status === "running" && `Importerar… ${job.progress > 0 ? `${job.progress}%` : ""}`}
                    {job.status === "completed" && "Import klar"}
                    {job.status === "failed" && "Import misslyckades"}
                  </span>
                  {(job.status === "pending" || job.status === "running") && (
                    <span className="text-xs text-slate-500 dark:text-white/50">
                      {job.progress > 0 ? `${job.progress}%` : "Väntar"}
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
                    {chaptersCreated} kapitel importerade
                  </p>
                )}
                {job.status === "completed" && frontMatterCount != null && frontMatterCount > 0 && (
                  <p className="mt-1 text-emerald-700 dark:text-emerald-300">
                    {frontMatterCount} inledande avsnitt (förord/innehåll) separerades automatiskt
                  </p>
                )}
                {job.status === "completed" && titleSet && resolvedTitle && (
                  <p className="mt-1 text-emerald-700 dark:text-emerald-300">
                    Titel satt automatiskt: {resolvedTitle}
                  </p>
                )}
                {warnings.length > 0 && (
                  <p className="mt-1 text-xs text-slate-500 dark:text-white/50">
                    Noteringar: {warnings.join(", ")}
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
  const [bookTitle, setBookTitle] = useState(book.title ?? "Namnlös");
  const [isRenamingBook, setIsRenamingBook] = useState(false);
  const [bookTitleDraft, setBookTitleDraft] = useState(book.title ?? "Namnlös");
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
  const translationPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const translationPollStartedAtRef = useRef<number>(0);
  const [isGeneratingAudiobook, setIsGeneratingAudiobook] = useState(false);
  const [audiobookError, setAudiobookError] = useState<string | null>(null);
  const [audiobookProgress, setAudiobookProgress] = useState<{
    totalChapters: number;
    completedChapters: number;
    currentChapterTitle: string | null;
  } | null>(null);
  const [ttsStatus, setTtsStatus] = useState<"idle" | "generating" | "uploading" | "done" | "error">("idle");
  const [ttsMessage, setTtsMessage] = useState<string | null>(null);
  const [ttsManualSteps, setTtsManualSteps] = useState<string | null>(null);
  const [ttsAudioUrl, setTtsAudioUrl] = useState<string | null>(null);
  const [ttsVoice, setTtsVoice] = useState<string>("default");
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

  // Jobbar som ska visas i banner: aldrig audiobook när funktionen är avstängd
  const jobsForBanner = useMemo(
    () => (getAudiobookEnabled() ? allJobs : allJobs.filter((j) => j.kind !== "audiobook")),
    [allJobs]
  );

  // Import-jobb filtrerade för inline progress i ImportManusSection
  const importJobs = useMemo(() => allJobs.filter((j) => j.kind === "import"), [allJobs]);

  // Audiobook-state endast när funktionen är på (inga tomma/döda states, progress endast för aktiva jobtyper)
  const latestAudiobookJob = useMemo(
    () => (getAudiobookEnabled() ? allJobs.find((j) => j.kind === "audiobook") ?? null : null),
    [allJobs]
  );
  const isAudiobookJobActive = isJobActiveStatus(latestAudiobookJob?.status);
  const isAudiobookJobFailed = normalizeJobStatus(latestAudiobookJob?.status) === "failed";
  const isAudiobookActive = isGeneratingAudiobook || !!isAudiobookJobActive;
  const serverAudiobookProgress = useMemo(() => {
    if (!latestAudiobookJob || !isJobActiveStatus(latestAudiobookJob.status)) return null;
    const meta = latestAudiobookJob.meta as Record<string, unknown>;
    return {
      totalChapters: (meta.totalChapters as number) ?? 0,
      completedChapters: (meta.completedChapters as number) ?? 0,
      currentChapterTitle: (meta.currentChapterTitle as string) ?? null,
    };
  }, [latestAudiobookJob]);
  const effectiveAudiobookProgress = audiobookProgress ?? serverAudiobookProgress;
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

  const missingPublishRequirements = useMemo(() => {
    const missing: string[] = [];
    if (!bookTitle.trim()) missing.push("Lägg till en titel");
    if (!displayCoverUrl) missing.push("Ladda upp en omslagsbild");
    if (!activeVersion?.id) missing.push("Skapa en bokversion");
    if (chapters.length === 0) {
      missing.push("Lägg till minst ett kapitel");
    } else if (!chapters.some((chapter) => hasReadableContent(chapter.content))) {
      missing.push("Skriv innehåll i minst ett kapitel");
    }
    return missing;
  }, [bookTitle, displayCoverUrl, activeVersion?.id, chapters]);

  const publishDisabled = isPublishing || coverUploading || missingPublishRequirements.length > 0;
  const visibilityChanged = isPublished && activeVisibility != null && publishVisibility !== activeVisibility;
  const confirmCopy =
    confirmPublishAction === "publish"
      ? `Publicera denna version som ${selectedVisibilityLabel}?`
      : confirmPublishAction === "update"
        ? `Uppdatera synlighet till ${selectedVisibilityLabel}?`
        : confirmPublishAction === "unpublish"
          ? "Avpublicera denna version? Den kommer inte längre vara synlig för läsare."
          : null;
  const publishButtonClass = `flex items-center gap-2 rounded-full border border-[#907AFF]/30 bg-[#907AFF] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#7c6ae6] focus:outline-none focus:ring-2 focus:ring-[#907AFF]/50 ${
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

  type TranslationUiStatus = "idle" | "translating" | "done" | "error";
  const isPollingCurrent = isPollingTranslation && lastRequestedTargetLanguage === translateTargetLanguage;
  const translationUiStatus = useMemo<TranslationUiStatus>(() => {
    if (currentTargetVersion?.status === "failed") return "error";
    if (currentTargetVersion?.status === "translating" || isPollingCurrent) return "translating";
    if (currentTargetVersion?.status === "done" || currentTargetVersion?.published_at) return "done";
    return "idle";
  }, [currentTargetVersion?.status, currentTargetVersion?.published_at, isPollingCurrent]);

  const hasGeneratedAudiobookAsset =
    Boolean(latestAudiobookAsset?.audio_url) && latestAudiobookAsset?.status === "generated";
  const audiobookFeatureEnabled = getAudiobookEnabled();
  const audiobookStatusUi = isAudiobookActive
    ? "generating"
    : hasGeneratedAudiobookAsset
      ? "published"
      : (book.audiobook_status ?? "not_started");
  const isProFeatureLocked = billing.loading || !billing.isProActive;
  const proFeatureLockMessage = billing.loading
    ? "Kontrollerar abonnemang…"
    : billing.pastDue
      ? "Din prenumeration är past_due. Uppdatera betalningen för att låsa upp funktionen."
      : "Verkli Pro krävs för denna funktion.";

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

    const queueHealthy = await checkTranslationQueueHealth();
    if (!queueHealthy) {
      setTranslateMessage("Översättningstjänsten är tillfälligt otillgänglig. Försök igen snart.");
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
        setTranslateMessage(resolveErrorMessage(data?.error));
        return;
      }
      setTranslateMessage("Översättning startad. Väntar på att den blir klar…");
      setLastRequestedTargetLanguage(translateTargetLanguage);
      startTranslationPoll();
    } catch (err) {
      setTranslateMessage("Kunde inte starta översättning. Försök igen.");
    } finally {
      setIsStartingTranslation(false);
    }
  }, [
    checkTranslationQueueHealth,
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
      setPublishError("Åtgärda kraven innan du publicerar.");
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
        setPublishToast("Publicerad");
      } else if (action === "unpublish") {
        setPublishToast("Avpublicerad");
      } else {
        setPublishToast("Publiceringsinställningar uppdaterade");
      }
    } catch (err) {
      if (process.env.NODE_ENV === "development") {
        console.error("[publish failed]", err);
      }
      setPublishError("Kunde inte uppdatera publiceringsinställningar. Försök igen.");
    } finally {
      setIsPublishing(false);
      setConfirmPublishAction(null);
      if (succeeded) setPublishMenuOpen(false);
    }
  };

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
      toast.success("Prissättning sparad.");
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
        setCoverError("Välj en bildfil.");
        return;
      }
      setCoverError(null);
      setCoverUploading(true);
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setCoverError("Du måste vara inloggad för att ladda upp omslag.");
        setCoverUploading(false);
        return;
      }
      const { url, error: uploadError } = await uploadBookCover(file, user.id, book.id);
      if (uploadError) {
        setCoverError("Omslag kunde inte laddas upp. Försök igen.");
        setCoverUploading(false);
        return;
      }
      if (!url) {
        setCoverError("Omslag kunde inte laddas upp. Försök igen.");
        setCoverUploading(false);
        return;
      }
      const { error: updateError } = await supabase
        .from("books")
        .update({ cover_image: url })
        .eq("id", book.id);
      if (updateError) {
        setCoverError("Omslag kunde inte sparas. Försök igen.");
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
      setBookTitleError("Kunde inte spara titel. Försök igen.");
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
    setBookTitle(book.title ?? "Namnlös");
    if (!isRenamingBook) {
      setBookTitleDraft(book.title ?? "Namnlös");
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

    if (isJobActiveStatus(normalizedStatus)) {
      setIsGeneratingAudiobook(true);
      setAudiobookError(null);
      setAudiobookProgress({
        totalChapters: (meta.totalChapters as number) ?? 0,
        completedChapters: (meta.completedChapters as number) ?? 0,
        currentChapterTitle: (meta.currentChapterTitle as string) ?? null,
      });
      return;
    }

    setIsGeneratingAudiobook(false);
    if (normalizedStatus === "failed") {
      setAudiobookError(latestAudiobookJob.error ?? "Generering kunde inte slutföras. Försök igen.");
      return;
    }
    if (normalizedStatus === "completed") {
      setAudiobookError(null);
    }
  }, [audiobookFeatureEnabled, latestAudiobookJob]);

  const handleGenerateAudiobook = useCallback(async () => {
    if (isGeneratingAudiobook || !audiobookFeatureEnabled) return;
    setAudiobookError(null);
    setAudiobookProgress(null);
    setIsGeneratingAudiobook(true);
    try {
      const res = await fetch(`/api/books/${book.id}/audiobook/generate`, { method: "POST" });
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
      });
      await refetchBookJob();
    } catch {
      setAudiobookError("Kunde inte starta generering. Försök igen.");
      setIsGeneratingAudiobook(false);
    }
  }, [audiobookFeatureEnabled, book.id, isGeneratingAudiobook, refetchBookJob]);

  const handleJobRetry = useCallback(
    async (job: UnifiedJob) => {
      if (job.kind === "audiobook") {
        handleGenerateAudiobook();
        return;
      }

      if (job.kind === "translation") {
        if (!activeVersion?.id) {
          toast.error("Ingen aktiv källversion hittades.");
          return;
        }

        const queueHealthy = await checkTranslationQueueHealth();
        if (!queueHealthy) {
          toast.error("Översättningstjänsten är tillfälligt otillgänglig. Försök igen snart.");
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
          setTranslateMessage(`Översättning återstartad (${getLanguageLabel(targetLanguage)}).`);
          startTranslationPoll();
          await refetchBookJob();
          toast.success("Översättning köad igen.");
        } catch {
          toast.error("Kunde inte köra översättningen igen.");
        }
        return;
      }

      if (job.kind === "import") {
        try {
          const res = await fetch(`/api/books/imports/${job.id}`, { method: "POST" });
          const data = await res.json().catch(() => ({}));
          if (res.ok) {
            await refetchBookJob();
            toast.success(data?.message ?? "Importen är åter i kö.");
          } else {
            toast.error(resolveErrorMessage(data?.error));
          }
        } catch {
          toast.error("Kunde inte köra importen igen.");
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
        setTtsMessage(resolveErrorMessage(data?.error));
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
      setTtsMessage("Ljud kunde inte genereras. Försök igen.");
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
        toast.error(resolveErrorMessage(data.error));
        return;
      }
      router.refresh();
    } catch {
      toast.error("Kunde inte generera. Försök igen.");
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
      toast.error("Kunde inte spara. Ändringar kanske inte sparades.");
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
        toast.error("Kunde inte skapa version. Försök igen.");
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
        title: `Kapitel ${maxOrder + 1}`,
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
      toast.error("Kunde inte skapa kapitel. Försök igen.");
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
    { id: "focus", label: "Växla fokusläge", shortcut: "⌘⇧F", run: () => setFocusMode((f) => !f) },
    { id: "new-chapter", label: "Nytt kapitel", run: handleCreateChapter },
    { id: "preset-novel", label: "Förinställning: Roman", run: () => setPreset("novel") },
    { id: "preset-essay", label: "Förinställning: Essä", run: () => setPreset("essay") },
    { id: "preset-screenplay", label: "Förinställning: Manus", run: () => setPreset("screenplay") },
  ];

  if (focusMode) {
    return (
      <>
        {/* z-[10001] so focus overlay is above navbar (z-9999) */}
        <div className="fixed inset-0 z-[10001] flex flex-col bg-background">
          <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-200/80 bg-white px-4 py-3 dark:border-white/10 dark:bg-slate-900">
            <span className="text-sm text-slate-500 dark:text-white/50">
              Fokusläge — Esc eller ⌘⇧F för att avsluta
            </span>
            <div className="flex items-center gap-4">
              <span className="text-xs text-slate-500">{wordCount.toLocaleString()} ord</span>
              {sessionWords > 0 && (
                <span className="text-xs text-[#5c4bb8] dark:text-[#b8a9ff]">+{sessionWords} denna session</span>
              )}
              <button
                onClick={() => setFocusMode(false)}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-white/90"
              >
                Avsluta fokus
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
                  placeholder="Börja skriva..."
                  bookId={book.id}
                  chapterId={selectedChapter.id}
                  preset={preset}
                  onWordCount={setWordCount}
                />
              </div>
            ) : (
              <div className="flex h-full items-center justify-center">
                <p className="text-slate-500">Avsluta fokusläget för att välja ett kapitel</p>
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
        {/* Job banner — visible on all panels */}
        {jobLoading ? (
          <div
            className="mb-6 flex h-14 items-center rounded-xl border border-slate-200 bg-slate-50/50 px-4 dark:border-white/10 dark:bg-white/5"
            role="status"
            aria-label="Hämtar status"
          >
            <span className="text-sm text-slate-500 dark:text-white/50">Hämtar status…</span>
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
              Din prenumeration är <strong>past_due</strong>. Betalfunktioner är låsta tills betalningen uppdateras.{" "}
              <Link href="/account/billing" className="underline">
                Hantera abonnemang
              </Link>
              .
            </p>
          </div>
        )}

        <nav className="mb-6 flex flex-wrap gap-2 border-b border-slate-200 dark:border-white/10 pb-3" aria-label="Bokeditor: välj vy">
          <Link
            href={`/author/books/${book.id}${activeVersion ? `?lang=${normalizeLangKey(activeVersion.language_code)}` : ""}`}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              editorPanel === "editor"
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                : "text-slate-600 hover:bg-slate-100 dark:text-white/70 dark:hover:bg-white/10"
            }`}
          >
            Manus
          </Link>
          <Link
            href={`/author/books/${book.id}?panel=pricing${activeVersion ? `&lang=${normalizeLangKey(activeVersion.language_code)}` : ""}`}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              editorPanel === "pricing"
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                : "text-slate-600 hover:bg-slate-100 dark:text-white/70 dark:hover:bg-white/10"
            }`}
          >
            Prissättning och distribution
          </Link>
          <Link
            href={`/author/books/${book.id}?panel=import${activeVersion ? `&lang=${normalizeLangKey(activeVersion.language_code)}` : ""}`}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              editorPanel === "import"
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                : "text-slate-600 hover:bg-slate-100 dark:text-white/70 dark:hover:bg-white/10"
            }`}
          >
            Importera manus
          </Link>
        </nav>

        {editorPanel === "pricing" && (
          <div className="max-w-2xl space-y-6">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Prissättning och distribution</h2>

            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5 dark:border-white/10 dark:bg-white/5 space-y-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Pris och valuta</h3>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm text-slate-700 dark:text-white/80">Gratis</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={priceAmountMinor > 0}
                  aria-label="Bok gratis eller betald"
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
                <span className="text-sm text-slate-700 dark:text-white/80">Betald</span>
              </div>
              {priceAmountMinor > 0 && (
                <div className="flex flex-wrap gap-4 pt-2">
                  <div>
                    <label htmlFor="price-amount" className="mb-1 block text-xs text-slate-500 dark:text-white/50">Pris (visas för läsare)</label>
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
                      aria-label="Pris i valuta"
                      className="w-28 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none dark:border-white/20 dark:bg-white/10 dark:text-white"
                    />
                  </div>
                  <div>
                    <label htmlFor="price-currency" className="mb-1 block text-xs text-slate-500 dark:text-white/50">Valuta</label>
                    <select
                      id="price-currency"
                      value={priceCurrency}
                      onChange={(e) => setPriceCurrency(e.target.value)}
                      aria-label="Valuta"
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none dark:border-white/20 dark:bg-white/10 dark:text-white"
                    >
                      <option value="SEK">SEK</option>
                      <option value="EUR">EUR</option>
                      <option value="USD">USD</option>
                    </select>
                  </div>
                </div>
              )}
              <p className="text-xs text-slate-500 dark:text-white/50">Priset sparas i systemet i öre/cent. Här visas det som hela kronor eller valutaenheter.</p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5 dark:border-white/10 dark:bg-white/5 space-y-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Försäljningsmodell</h3>
              <div className="flex items-center gap-3 rounded-lg border border-[#907AFF]/30 bg-[#907AFF]/10 px-3 py-2 dark:bg-[#907AFF]/15">
                <span className="text-sm font-medium text-slate-900 dark:text-white">Hel bok</span>
                <span className="rounded-full bg-[#907AFF]/20 px-2 py-0.5 text-xs font-medium text-[#5c4bb8] dark:text-[#b8a9ff]">Valt</span>
              </div>
              <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 dark:border-white/10 dark:bg-white/5">
                <span className="text-sm text-slate-600 dark:text-white/60">Kapitel</span>
                <span className="text-xs text-slate-500 dark:text-white/50">Kommer senare</span>
              </div>
              <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 dark:border-white/10 dark:bg-white/5">
                <span className="text-sm text-slate-600 dark:text-white/60">Paket</span>
                <span className="text-xs text-slate-500 dark:text-white/50">Kommer senare</span>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5 dark:border-white/10 dark:bg-white/5">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Synlighet och åtkomst</h3>
              <p className="text-sm text-slate-700 dark:text-white/80">
                {priceAmountMinor <= 0
                  ? "Gratis — alla kan läsa boken."
                  : "Betald — läsare behöver köpa boken eller ha tillgång via entitlement för att läsa."}
                {" "}
                {currentVisibility === "followers" && "Endast följare påverkar upptäckt i utforskning, inte betalväggen."}
              </p>
            </div>

            {!isPublished && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/30" role="status">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Publicera boken för att kunna sälja den.</p>
              </div>
            )}
            {priceAmountMinor > 0 && !stripeConfigured && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/30" role="status">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Betalningskonfiguration saknas. Kontakta oss för att aktivera köp.</p>
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleSavePricing}
                disabled={pricingSaving || (priceAmountMinor === initialPriceMinor && priceCurrency === initialCurrency)}
                aria-label="Spara prissättning"
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-white dark:text-slate-900"
              >
                {pricingSaving ? "Sparar…" : "Spara"}
              </button>
              {pricingError && <p className="text-sm text-red-600 dark:text-red-400" role="alert">{pricingError}</p>}
              {pricingSaved && <p className="text-sm text-emerald-600 dark:text-emerald-400" role="status">Sparat.</p>}
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
          <span className="text-slate-500 dark:text-white/50">
            Version: {getLanguageLabel(activeLanguage)}
          </span>
        </div>
        <div className="mb-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(520px,680px)_auto] lg:items-center">
          <div className="min-w-0">
            {!isRenamingBook ? (
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-4xl font-semibold tracking-tight text-slate-900 dark:text-white">
                  {bookTitle}
                </h1>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    isPublished
                      ? "bg-[#907AFF]/15 text-[#5c4bb8] dark:bg-[#907AFF]/25 dark:text-[#b8a9ff]"
                      : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-white/70"
                  }`}
                >
                  {isPublished ? "Publicerad" : "Utkast"}
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
                  Byt namn
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
                    {bookTitleSaving ? "Sparar…" : "Spara"}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelRenameBook}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-white/20 dark:text-white/70 dark:hover:bg-white/5"
                  >
                    Avbryt
                  </button>
                </div>
                {bookTitleError && (
                  <p className="text-xs text-red-600 dark:text-red-400">{bookTitleError}</p>
                )}
              </div>
            )}
            <p className="mt-2 text-sm text-slate-600 dark:text-white/60">
              {isPublished ? currentVisibilitySummary : "Utkast — inte synlig för läsare ännu"} • {chapters.length} kapitel
            </p>
          </div>
          <div className="w-full">
            <div className="flex flex-wrap items-end gap-4">
              <div className="min-w-[200px] flex-1">
                <div className="relative mt-1">
                  <select
                    id="chapter-select"
                    value={selectedChapterId ?? ""}
                    onChange={(e) => {
                      setSelectedChapterId(e.target.value || null);
                      setSessionStartWords(null);
                    }}
                    className="h-11 w-full appearance-none rounded-full border border-slate-200 bg-white px-4 pr-10 text-sm font-medium text-slate-900 focus:border-slate-400 focus:outline-none dark:border-white/15 dark:bg-white/10 dark:text-white"
                  >
                    {chapters.length === 0 && <option value="">Inga kapitel ännu</option>}
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
              <div className="min-w-[180px] flex-1">
                <button
                  type="button"
                  onClick={handleCreateChapter}
                  disabled={isCreating}
                  className="mt-1 h-11 w-full rounded-full bg-slate-900 px-4 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-900"
                >
                  {isCreating ? "Skapar…" : "+ Nytt kapitel"}
                </button>
              </div>
              <div className="min-w-[180px] flex-1">
                <button
                  type="button"
                  onClick={() => coverInputRef.current?.click()}
                  disabled={coverUploading}
                  className="mt-1 h-11 w-full rounded-full border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/15 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
                >
                  {coverUploading ? "Laddar upp…" : "Ladda upp omslag"}
                </button>
                {coverError && (
                  <p className="mt-2 text-xs text-red-600 dark:text-red-400" role="alert">
                    {coverError}
                  </p>
                )}
              </div>
            </div>
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
                Publicera
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
                  className="absolute right-0 z-[200] mt-3 w-[360px] rounded-2xl border border-slate-200 bg-white p-4 shadow-xl dark:border-white/10 dark:bg-[#0b0b12]"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Publicera</h2>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        isPublished
                          ? "bg-[#907AFF]/15 text-[#5c4bb8] dark:bg-[#907AFF]/25 dark:text-[#b8a9ff]"
                          : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-white/70"
                      }`}
                    >
                      {isPublished ? "Publicerad" : "Utkast"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-white/50">
                    Publiceringsinställningar för denna version. Utkast är privata tills du publicerar.
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-white/50">
                    <span>{isPublished ? currentVisibilitySummary : "Inte synlig för läsare ännu."}</span>
                    {isPublished && (
                      <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-white/70">
                        {currentVisibilityLabel}
                      </span>
                    )}
                  </div>

                  <fieldset className="mt-4 space-y-2">
                    <legend className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-white/50">
                      Synlighet
                    </legend>
                    {PUBLISH_VISIBILITY_OPTIONS.map((option) => {
                      const selected = publishVisibility === option.value;
                      return (
                        <label
                          key={option.value}
                          className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 transition ${
                            selected
                              ? "border-[#907AFF]/50 bg-[#907AFF]/10 dark:border-[#907AFF]/50 dark:bg-[#907AFF]/15"
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
                      <p className="mb-2 font-semibold">Innan du kan publicera</p>
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
                      <p className="mb-1 font-semibold text-slate-900 dark:text-white">Bekräfta</p>
                      <p className="text-xs text-slate-600 dark:text-white/60">{confirmCopy}</p>
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => handlePublishAction(confirmPublishAction)}
                          disabled={isPublishing}
                          className="rounded-lg bg-[#907AFF] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#7c6ae6] disabled:opacity-60"
                        >
                          {isPublishing ? "Arbetar…" : "Bekräfta"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmPublishAction(null)}
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/20 dark:text-white/70 dark:hover:bg-white/5"
                        >
                          Avbryt
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
                          className="rounded-lg bg-[#907AFF] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#7c6ae6] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isPublishing ? "Publicerar…" : "Publicera"}
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
                            {isPublishing ? "Uppdaterar…" : "Uppdatera publiceringsinställningar"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmPublishAction("unpublish")}
                            disabled={isPublishing}
                            className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900/50 dark:bg-white/10 dark:text-red-200 dark:hover:bg-red-950/30"
                          >
                            Avpublicera
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
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
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5 dark:border-white/10 dark:bg-white/5">
              <h2 className="mb-3 text-base font-semibold text-slate-900 dark:text-white">Omslag</h2>
              <div className="space-y-2">
                <div className="aspect-[3/4] overflow-hidden rounded-lg border border-slate-200 bg-slate-100 dark:border-white/10 dark:bg-white/5">
                  {displayCoverUrl ? (
                    <img
                      src={displayCoverUrl}
                      alt="Bokomslag"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-sm text-slate-500 dark:text-white/50">
                      Ingen omslagsbild
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

            {getTranslationsEnabled() && (
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5 dark:border-white/10 dark:bg-white/5">
                <h2 className="mb-3 text-base font-semibold text-slate-900 dark:text-white">Översättning</h2>
                <p className="mb-3 text-xs text-slate-500 dark:text-white/50">
                  Skapa en ny språkversion av denna bok. Översättningen visas när den är klar.
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
                    {translationUiStatus === "translating" && "Översätts…"}
                    {translationUiStatus === "done" && STATUS_LABELS.completed}
                    {translationUiStatus === "error" && STATUS_LABELS.failed}
                  </span>
                </div>
                <label htmlFor="translate-language" className="mb-1 block text-xs text-slate-500 dark:text-white/50">Målspråk</label>
                <select
                  id="translate-language"
                  value={translateTargetLanguage}
                  onChange={(e) => setTranslateTargetLanguage(e.target.value as SupportedLanguage)}
                  className="mb-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none dark:border-white/20 dark:bg-white/10 dark:text-white"
                >
                  {LANGUAGE_OPTIONS.filter((opt) => opt.value !== translationSourceLang).map((opt) => {
                    const supported = isTranslationPairSupported(translationSourceLang, opt.value);
                    return (
                      <option key={opt.value} value={opt.value} disabled={!supported}>
                        {opt.label}{supported ? "" : " (ej tillgänglig)"}
                      </option>
                    );
                  })}
                </select>
                <button
                  type="button"
                  onClick={handleStartTranslation}
                  disabled={isStartingTranslation || isProFeatureLocked || !isTranslationPairSupported(translationSourceLang, translateTargetLanguage)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
                >
                  {isStartingTranslation
                    ? "Startar…"
                    : isProFeatureLocked
                      ? billing.loading
                        ? "Kontrollerar abonnemang…"
                        : billing.pastDue
                          ? "Låst: betalning krävs"
                          : "Starta översättning (Pro krävs)"
                      : "Starta översättning"}
                </button>
                {isProFeatureLocked && (
                  <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
                    {proFeatureLockMessage}{" "}
                    {!billing.loading && (
                      <Link href="/account/billing" className="underline">
                        Hantera abonnemang
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
                    className="mt-2 w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-white/90"
                  >
                    Öppna version
                  </button>
                )}
                {translationQueueHealthy === false && (
                  <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
                    Översättningskön är offline just nu.
                  </div>
                )}
                {translateMessage && (
                  <div
                    className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
                      translationUiStatus === "done" || translateMessage.toLowerCase().includes("klar")
                        ? "border-[#907AFF]/40 bg-[#907AFF]/10 text-[#5c4bb8] dark:border-[#907AFF]/40 dark:bg-[#907AFF]/15 dark:text-[#b8a9ff]"
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

            {getTranslationsEnabled() && (
              <details className="rounded-xl border border-slate-200 bg-slate-50/50 dark:border-white/10 dark:bg-white/5">
                <summary className="cursor-pointer px-5 py-4 text-base font-semibold text-slate-900 dark:text-white">
                  Översättningspanel
                </summary>
                <div className="px-5 pb-5">
                  <TranslationPanel bookId={book.id} />
                </div>
              </details>
            )}

            <div id="tts" className="rounded-xl border border-slate-200 bg-slate-50/50 p-5 dark:border-white/10 dark:bg-white/5">
              <h2 className="mb-3 text-base font-semibold text-slate-900 dark:text-white">Text till tal</h2>
              <p className="mb-3 text-xs text-slate-500 dark:text-white/50">
                Generera ljud från bokens första kapitel. Använder standardrösten (Piper).
              </p>
              <div className="mb-3 flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500 dark:text-white/50">Status:</span>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    ttsStatus === "generating" || ttsStatus === "uploading"
                      ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200"
                      : ttsStatus === "done"
                        ? "bg-[#907AFF]/15 text-[#5c4bb8] dark:bg-[#907AFF]/25 dark:text-[#b8a9ff]"
                        : ttsStatus === "error"
                          ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200"
                          : "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
                  }`}
                  role="status"
                >
                  {ttsStatus === "idle" && STATUS_LABELS.idle}
                  {ttsStatus === "generating" && "Skapas…"}
                  {ttsStatus === "uploading" && "Laddas upp…"}
                  {ttsStatus === "done" && STATUS_LABELS.completed}
                  {ttsStatus === "error" && STATUS_LABELS.failed}
                </span>
              </div>
              <label htmlFor="tts-voice" className="mb-1 block text-xs text-slate-500 dark:text-white/50">Röst</label>
              <select
                id="tts-voice"
                value={ttsVoice}
                onChange={(e) => setTtsVoice(e.target.value)}
                className="mb-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none dark:border-white/20 dark:bg-white/10 dark:text-white"
              >
                <option value="default">Standard (sv_SE-nst-medium)</option>
              </select>
              <button
                type="button"
                onClick={handleStartTts}
                disabled={ttsStatus === "generating" || ttsStatus === "uploading"}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
              >
                {ttsStatus === "generating" || ttsStatus === "uploading"
                  ? ttsStatus === "uploading"
                    ? "Laddas upp…"
                    : "Skapas…"
                  : "Generera ljudförhandsvisning"}
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
                      Kopiera ljud-URL
                    </button>
                    <a
                      href={ttsAudioUrl ?? latestAudiobookAsset?.audio_url ?? "#"}
                      download="audiobook-sample.wav"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
                    >
                      Ladda ner
                    </a>
                  </div>
                </div>
              )}
              {ttsMessage && (
                <div
                  className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
                    ttsStatus === "done" || ttsMessage.includes("genererat") || ttsMessage.includes("kopierad")
                      ? "border-[#907AFF]/40 bg-[#907AFF]/10 text-[#5c4bb8] dark:border-[#907AFF]/40 dark:bg-[#907AFF]/15 dark:text-[#b8a9ff]"
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
                  className="mt-3 rounded-lg border border-[#907AFF]/40 bg-[#907AFF]/10 px-3 py-3 text-sm text-[#5c4bb8] dark:border-[#907AFF]/30 dark:bg-[#907AFF]/15 dark:text-[#b8a9ff]"
                  role="alert"
                >
                  <p className="mb-1 font-medium">Åtgärd krävs:</p>
                  <p className="whitespace-pre-wrap">{ttsManualSteps}</p>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5 dark:border-white/10 dark:bg-white/5">
              <h2 className="mb-3 text-base font-semibold text-slate-900 dark:text-white">Original</h2>
              <label htmlFor="original-url-editor" className="mb-1 block text-xs text-slate-500 dark:text-white/50">Originalet finns på Amazon</label>
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

            <div id="audiobook" className="rounded-xl border border-slate-200 bg-slate-50/50 p-5 dark:border-white/10 dark:bg-white/5">
              <h2 className="mb-2 text-base font-semibold text-slate-900 dark:text-white">Ljudbok</h2>
              <div className="mb-2 flex items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    audiobookStatusUi === "published"
                      ? "bg-[#907AFF]/15 text-[#5c4bb8] dark:bg-[#907AFF]/25 dark:text-[#b8a9ff]"
                      : audiobookStatusUi === "generating"
                        ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
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
                    <span>{effectiveAudiobookProgress.currentChapterTitle ?? "Bearbetar…"}</span>
                    <span>{effectiveAudiobookProgress.completedChapters} / {effectiveAudiobookProgress.totalChapters}</span>
                  </div>
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
                </div>
              )}

              <button
                type="button"
                onClick={handleGenerateAudiobook}
                disabled={isAudiobookActive || !audiobookFeatureEnabled || isProFeatureLocked}
                className="mb-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
              >
                {!audiobookFeatureEnabled
                  ? "Skapa ljudbok (otillgänglig)"
                  : isProFeatureLocked
                  ? billing.loading
                    ? "Kontrollerar abonnemang…"
                    : billing.pastDue
                      ? "Låst: betalning krävs"
                      : "Skapa ljudbok (Pro krävs)"
                  : isAudiobookActive
                  ? effectiveAudiobookProgress
                    ? `Skapas (${effectiveAudiobookProgress.completedChapters}/${effectiveAudiobookProgress.totalChapters})…`
                    : "I kö…"
                  : "Skapa ljudbok"}
              </button>

              {audiobookFeatureEnabled && isProFeatureLocked && (
                <div className="mb-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
                  {proFeatureLockMessage}{" "}
                  {!billing.loading && (
                    <Link href="/account/billing" className="underline">
                      Hantera abonnemang
                    </Link>
                  )}
                </div>
              )}

              {!audiobookFeatureEnabled && (
                <p className="mb-2 text-xs text-slate-600 dark:text-white/60" role="status">
                  Ljudboksgenerering är tillfälligt avstängd eftersom worker inte är kompatibel i denna miljö.
                </p>
              )}

              {latestAudiobookAsset?.audio_url && (
                <div className="mb-2">
                  <audio controls className="w-full" src={latestAudiobookAsset.audio_url}>
                    Din webbläsare stöder inte ljuduppspelning.
                  </audio>
                </div>
              )}

              {(audiobookStatusUi === "failed" || effectiveAudiobookError) && (
                <p className="text-xs text-red-600 dark:text-red-400" role="alert">
                  {effectiveAudiobookError ?? "Kunde inte skapa ljudbok. Försök igen."}
                </p>
              )}
            </div>

            {getMarketingEnabled() && (
            <div id="marketing" className="rounded-xl border border-slate-200 bg-slate-50/50 p-5 dark:border-white/10 dark:bg-white/5">
              <h2 className="mb-3 text-base font-semibold text-slate-900 dark:text-white">Lanseringstext</h2>
              <div className="mb-3 flex flex-wrap gap-2">
                <div className="flex flex-col gap-1">
                  <label htmlFor="marketing-channel" className="text-xs text-slate-500 dark:text-white/50">Kanal</label>
                  <select
                    id="marketing-channel"
                    value={marketingChannel}
                    onChange={(e) => setMarketingChannel(e.target.value as MarketingChannel)}
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 focus:border-slate-500 focus:outline-none dark:border-white/20 dark:bg-white/10 dark:text-white"
                  >
                    {MARKETING_CHANNELS.map((c) => (
                      <option key={c} value={c}>{MARKETING_CHANNEL_LABELS[c]}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="marketing-language" className="text-xs text-slate-500 dark:text-white/50">Språk</label>
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
                  Ingen text för denna kanal och språk än. Generera nedan.
                </p>
              )}
              <button
                type="button"
                onClick={handleGenerateMarketingCopy}
                disabled={isGeneratingMarketing || isProFeatureLocked}
                className="mb-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
              >
                {isGeneratingMarketing
                  ? "Skapas…"
                  : isProFeatureLocked
                    ? billing.loading
                      ? "Kontrollerar abonnemang…"
                      : billing.pastDue
                        ? "Låst: betalning krävs"
                        : "Generera lanseringstext (Pro krävs)"
                    : "Generera lanseringstext"}
              </button>
              {isProFeatureLocked && (
                <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
                  {proFeatureLockMessage}{" "}
                  {!billing.loading && (
                    <Link href="/account/billing" className="underline">
                      Hantera abonnemang
                    </Link>
                  )}
                </div>
              )}
              {currentCampaign && (
                <div className="space-y-2">
                  {currentCampaign.headline && (
                    <p className="text-xs font-medium text-slate-500 dark:text-white/50">Rubrik</p>
                  )}
                  {currentCampaign.headline && (
                    <p className="whitespace-pre-wrap break-words rounded border border-slate-200 bg-white p-2 text-xs text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-white/90">
                      {currentCampaign.headline}
                    </p>
                  )}
                  {currentCampaign.caption && (
                    <>
                      <p className="text-xs font-medium text-slate-500 dark:text-white/50">Text</p>
                      <p className="whitespace-pre-wrap break-words rounded border border-slate-200 bg-white p-2 text-xs text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-white/90">
                        {currentCampaign.caption}
                      </p>
                    </>
                  )}
                  {currentCampaign.cta && (
                    <>
                      <p className="text-xs font-medium text-slate-500 dark:text-white/50">Uppmaning</p>
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
                    {marketingCopyFeedback ? "Kopierat!" : "Kopiera till urklipp"}
                  </button>
                </div>
              )}
              <p className="mt-3 text-xs text-slate-500 dark:text-white/50">Läsar-URL</p>
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

            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5 dark:border-white/10 dark:bg-white/5">
              <h2 className="mb-3 text-base font-semibold text-slate-900 dark:text-white">Marknadsportalen</h2>
              {isPublished ? (
                <>
                  <p className="mb-3 text-xs text-slate-500 dark:text-white/50">
                    Planera kampanjer, generera text och hantera distribution för denna bok.
                  </p>
                  <Link
                    href="/author/marketing"
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#907AFF] to-[#8069EE] px-3 py-2 text-sm font-semibold text-white transition hover:from-[#8069EE] hover:to-[#7058DD]"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M12.577 4.878a.75.75 0 01.919-.53l4.78 1.281a.75.75 0 01.531.919l-1.281 4.78a.75.75 0 01-1.449-.387l.81-3.022a19.407 19.407 0 00-5.594 5.203.75.75 0 01-1.139.093L7.55 10.81l-4.72 4.72a.75.75 0 01-1.06-1.06l5.25-5.25a.75.75 0 011.06 0l2.346 2.346a20.893 20.893 0 015.264-4.97l-2.633.706a.75.75 0 01-.919-.53z" clipRule="evenodd" />
                    </svg>
                    Öppna marknadsportalen
                  </Link>
                </>
              ) : (
                <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-center text-xs text-slate-500 dark:border-white/15 dark:bg-white/5 dark:text-white/50">
                  Publicera boken för att öppna marknadsportalen
                </p>
              )}
            </div>
          </div>

          <div>
            {selectedChapter ? (
              <>
                <div className="mb-3 flex items-center justify-between">
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
                        className="min-w-[200px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-slate-500 focus:outline-none dark:border-white/20 dark:bg-white/10 dark:text-white"
                        autoFocus
                        aria-label="Kapiteltitel"
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveTitle(selectedChapter.id)}
                        disabled={isSaving || !tempTitle.trim()}
                        className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-white dark:text-slate-900"
                      >
                        {isSaving ? "Sparar…" : "Spara"}
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelEditTitle}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-white/20 dark:text-white/70 dark:hover:bg-white/5"
                      >
                        Avbryt
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">{selectedChapter.title}</h2>
                        <button
                          type="button"
                          onClick={() => handleStartEditTitle(selectedChapter.id, selectedChapter.title)}
                          className="text-xs text-slate-500 hover:text-slate-900 dark:text-white/50 dark:hover:text-white"
                        >
                          Byt namn
                        </button>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-white/50">
                        {isSaving ? (
                          <span className="flex items-center gap-1">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#907AFF]" />
                            Sparar…
                          </span>
                        ) : lastSaved ? (
                          <span className="text-[#5c4bb8] dark:text-[#b8a9ff]">
                            Senast sparad {lastSaved.toLocaleTimeString()}
                          </span>
                        ) : (
                          "Autospar aktivt"
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

                <div className="mt-3">
                  <TiptapEditor
                    key={selectedChapter.id}
                    content={selectedChapter.content}
                    onUpdate={(json) => handleAutoSave(selectedChapter.id, json)}
                    placeholder="Börja skriva ditt kapitel…"
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
                  {chapters.length === 0 ? "Skapa ditt första kapitel för att börja skriva" : "Välj ett kapitel i sidopanelen"}
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
