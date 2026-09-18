"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowRight, Check, Globe2, Headphones, Loader2 } from "lucide-react";
import { countWordsInContent } from "@/lib/tiptap-content";
import styles from "./AudiobookPanel.module.css";
import { getLanguageLabel, normalizeLanguage } from "@/lib/languages";
import {
  getAudiobookStatusLabel,
} from "../BookEditorView.helpers";
import type {
  AudiobookControlAction,
  AudiobookGenerationScope,
  BookVersion,
  Chapter,
} from "../BookEditorView.types";
import {
  AudiobookCheckoutModal,
  AudiobookPreviewPlayer,
} from "./AudiobookPanel.components";

const ManifestAudiobookPlayer = dynamic(
  () => import("@/components/books/ManifestAudiobookPlayer"),
  { ssr: false }
);

interface AudiobookPanelProps {
  bookId: string;
  bookLanguage: string | null;
  bookOriginalLanguage: string | null;
  chapters: Chapter[];
  selectedChapterId: string | null;
  activeVersion: BookVersion | null;
  activeLanguage: string;
  totalBookWordCount: number;
  billingLoading: boolean;
  billingIsProActive: boolean;
  audiobookFeatureEnabled: boolean;
  isAudiobookActive: boolean;
  audiobookStatusUi: string;
  audiobookError: string | null;
  effectiveAudiobookProgress: {
    totalChapters: number;
    completedChapters: number;
    currentChapterTitle: string | null;
    estimatedSecondsRemaining: number | null;
  } | null;
  effectiveAudiobookError: string | null;
  audiobookEtaText: string | null;
  audiobookScope: AudiobookGenerationScope;
  setAudiobookScope: (v: AudiobookGenerationScope) => void;
  audiobookSelectedChapterIds: string[];
  setAudiobookSelectedChapterIds: React.Dispatch<React.SetStateAction<string[]>>;
  isAudiobookChapterPickerOpen: boolean;
  setIsAudiobookChapterPickerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  audiobookRequestedChapterIds: string[];
  audiobookControlPending: AudiobookControlAction | null;
  canPauseAudiobook: boolean;
  canResumeAudiobook: boolean;
  canCancelAudiobook: boolean;
  handleAudiobookControl: (action: AudiobookControlAction) => Promise<void>;
  handleGenerateAudiobook: () => Promise<void>;
  audiobookSelectedLanguages: string[];
  setAudiobookSelectedLanguages: React.Dispatch<React.SetStateAction<string[]>>;
  audiobookCheckoutModalOpen: boolean;
  setAudiobookCheckoutModalOpen: (v: boolean) => void;
  audiobookCheckoutLoading: boolean;
  handleAudiobookCheckout: () => Promise<void>;
  shouldShowGeneratedAudiobookPlayer: boolean;
  fallbackGeneratedAudiobookUrl: string | null;
  refreshAudioUrl?: () => Promise<void>;
  latestAudiobookManifestUrl: string | null;
}

export default function AudiobookPanel({
  bookId,
  chapters,
  selectedChapterId,
  activeVersion,
  activeLanguage,
  totalBookWordCount,
  billingLoading,
  billingIsProActive,
  audiobookFeatureEnabled,
  isAudiobookActive,
  audiobookStatusUi,
  audiobookError,
  effectiveAudiobookProgress,
  effectiveAudiobookError,
  audiobookEtaText,
  audiobookScope,
  setAudiobookScope,
  audiobookSelectedChapterIds,
  setAudiobookSelectedChapterIds,
  isAudiobookChapterPickerOpen,
  setIsAudiobookChapterPickerOpen,
  audiobookRequestedChapterIds,
  audiobookControlPending,
  canPauseAudiobook,
  canResumeAudiobook,
  canCancelAudiobook,
  handleAudiobookControl,
  handleGenerateAudiobook,
  audiobookCheckoutModalOpen,
  setAudiobookCheckoutModalOpen,
  audiobookCheckoutLoading,
  handleAudiobookCheckout,
  shouldShowGeneratedAudiobookPlayer,
  fallbackGeneratedAudiobookUrl,
  refreshAudioUrl,
  latestAudiobookManifestUrl,
}: AudiobookPanelProps) {
  const languageCode = activeVersion?.language_code ?? activeLanguage;
  const language = getLanguageLabel(normalizeLanguage(languageCode));
  const scope = billingIsProActive ? audiobookScope : "book";
  const includedChapters = scope === "book" ? chapters : chapters.filter((chapter) => audiobookRequestedChapterIds.includes(chapter.id));
  const words = scope === "book" ? totalBookWordCount : includedChapters.reduce((sum, chapter) => sum + countWordsInContent(chapter.content), 0);
  const minutes = Math.round(words / 150);
  const durationLabel = words === 0 ? "—" : minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}min` : minutes > 0 ? `${minutes}min` : "< 1min";
  const progress = effectiveAudiobookProgress;
  const percent = progress && progress.totalChapters > 0 ? Math.min(100, Math.max(0, progress.completedChapters / progress.totalChapters * 100)) : 0;
  const error = audiobookStatusUi === "failed" ? effectiveAudiobookError ?? "Could not create audiobook. Try again." : audiobookError;
  const hasManuscript = chapters.length > 0 && totalBookWordCount > 0;
  const showManifest = shouldShowGeneratedAudiobookPlayer && !fallbackGeneratedAudiobookUrl && Boolean(latestAudiobookManifestUrl);
  const cannotGenerate = isAudiobookActive || !audiobookFeatureEnabled || billingLoading || !hasManuscript || (billingIsProActive && scope !== "book" && audiobookRequestedChapterIds.length === 0);

  return (
    <div className={styles.workspace}>
      <header className={styles.heading}>
        <div><h2>Audiobook</h2><p>A new way to hear your story. Listen, create, then review.</p></div>
        <span className={styles.edition}><Globe2 size={15} aria-hidden />{language} edition</span>
      </header>

      {showManifest ? (
        <section className={styles.completedAudio} aria-label="Generated audiobook">
          <div className={styles.sectionHeading}><div><h3>Your audio edition</h3><p>Listen through each chapter before publishing.</p></div><Headphones size={22} aria-hidden /></div>
          <ManifestAudiobookPlayer bookId={bookId} manifestUrl={latestAudiobookManifestUrl!} />
        </section>
      ) : (
        <AudiobookPreviewPlayer
          key={`${bookId}:${activeVersion?.id ?? activeLanguage}`}
          audioUrl={shouldShowGeneratedAudiobookPlayer ? fallbackGeneratedAudiobookUrl : null}
          bookId={bookId}
          versionId={activeVersion?.id}
          onRefreshAudioUrl={refreshAudioUrl}
          previewEnabled={audiobookFeatureEnabled}
        />
      )}

      <div className={styles.creationLayout}>
        <section className={styles.manuscript} aria-labelledby="audio-chapters-heading">
          <div className={styles.sectionHeading}><div><h3 id="audio-chapters-heading">Choose your chapters</h3><p>{billingIsProActive ? "Create the whole book, or work a chapter at a time." : "Pay per book, or use PRO for chapter-level control."}</p></div><span className={styles.chapterCount}>{chapters.length}</span></div>
          {!hasManuscript ? (
            <div className={styles.empty}><h4>Start with your manuscript</h4><p>Add a chapter with text before creating an audiobook.</p><Link href={`/author/books/${bookId}?panel=edit&lang=${encodeURIComponent(languageCode)}`} className={styles.textLink}>Open writing <ArrowRight size={15} aria-hidden /></Link></div>
          ) : (
            <>
              {billingIsProActive ? (
                <div className={styles.scope} role="group" aria-label="Chapters to generate">
                  <button type="button" aria-pressed={scope === "book"} onClick={() => setAudiobookScope("book")}>Whole book</button>
                  <button type="button" aria-pressed={scope === "current"} onClick={() => setAudiobookScope("current")}>Current chapter</button>
                  <button type="button" aria-pressed={scope === "selected"} onClick={() => {
                    setAudiobookScope("selected");
                    setIsAudiobookChapterPickerOpen(true);
                    if (selectedChapterId) setAudiobookSelectedChapterIds((prev) => prev.includes(selectedChapterId) ? prev : [...prev, selectedChapterId]);
                  }}>Choose chapters</button>
                </div>
              ) : <p className={styles.fullBookNote}>Whole book · {chapters.length} chapters</p>}

              {scope === "selected" ? (
                <div className={styles.chapterPicker}>
                  <div className={styles.chapterActions}>
                    <button type="button" aria-expanded={isAudiobookChapterPickerOpen} aria-controls="audio-chapter-list" onClick={() => setIsAudiobookChapterPickerOpen((prev) => !prev)}>{isAudiobookChapterPickerOpen ? "Hide chapter list" : "Show chapter list"}</button>
                    <span>{includedChapters.length} selected</span>
                  </div>
                  {isAudiobookChapterPickerOpen && <>
                    <div className={styles.selectionActions}><button type="button" onClick={() => setAudiobookSelectedChapterIds(chapters.map((chapter) => chapter.id))}>Select all</button><button type="button" onClick={() => setAudiobookSelectedChapterIds([])}>Clear</button></div>
                    <div id="audio-chapter-list" className={styles.chapterList}>
                      {chapters.map((chapter, index) => <label key={chapter.id} className={styles.chapterRow}>
                        <input type="checkbox" checked={audiobookSelectedChapterIds.includes(chapter.id)} onChange={() => setAudiobookSelectedChapterIds((prev) => prev.includes(chapter.id) ? prev.filter((id) => id !== chapter.id) : [...prev, chapter.id])} />
                        <span className={styles.chapterNumber}>{String(index + 1).padStart(2, "0")}</span><span>{chapter.title || `Chapter ${index + 1}`}</span>
                      </label>)}
                    </div>
                  </>}
                  {includedChapters.length === 0 && <p className={styles.hint}>Select at least one chapter to continue.</p>}
                </div>
              ) : (
                <div className={styles.chapterSummary}>
                  <span className={styles.chapterNumber}>{scope === "current" ? String(Math.max(0, chapters.findIndex((chapter) => chapter.id === selectedChapterId) + 1)).padStart(2, "0") : String(chapters.length).padStart(2, "0")}</span>
                  <div><strong>{scope === "current" ? includedChapters[0]?.title || "No chapter selected" : "Every chapter, in order"}</strong><p>{scope === "current" ? "Only this chapter will be generated." : "Narration follows the chapter order in your manuscript."}</p></div>
                </div>
              )}
            </>
          )}
          <section className={styles.languages} aria-labelledby="audio-language-heading">
            <Globe2 size={20} aria-hidden /><div><h4 id="audio-language-heading">Take it into another language</h4><p>This audiobook uses your active {language} edition. To create audio in another language, translate the book and open that edition first.</p><Link href={`/author/books/${bookId}?panel=translate&lang=${encodeURIComponent(languageCode)}`} className={styles.textLink}>Open Translate <ArrowRight size={15} aria-hidden /></Link></div>
          </section>
        </section>

        <aside className={styles.production} aria-labelledby="audio-generation-heading">
          <div className={styles.productionHeading}><h3 id="audio-generation-heading">Ready to create?</h3><Headphones size={20} aria-hidden /></div>
          <dl className={styles.facts}>
            <div><dt>Edition</dt><dd>{language}</dd></div>
            <div><dt>Chapters</dt><dd>{includedChapters.length} of {chapters.length}</dd></div>
            <div><dt>Estimated listening time</dt><dd>{durationLabel}</dd></div>
            <div><dt>Estimated generation</dt><dd>{words > 0 ? `~${Math.max(1, Math.round(minutes * 0.15))}min` : "—"}</dd></div>
          </dl>
          <p className={styles.estimateNote}>Estimates vary with narration pace and chapter length.</p>
          <div className={styles.accessNote}>{billingLoading ? <><Loader2 size={16} className={styles.spin} aria-hidden />Checking subscription…</> : billingIsProActive ? <><Check size={16} aria-hidden />Included in your PRO plan</> : <><span>299 kr</span> per full audiobook</>}</div>

          {isAudiobookActive && <div className={styles.progress} aria-live="polite">
            <div><strong>{getAudiobookStatusLabel(audiobookStatusUi)}</strong><span>{progress ? `${progress.completedChapters} / ${progress.totalChapters}` : "Queued"}</span></div>
            <div className={styles.progressTrack} role="progressbar" aria-label="Audiobook generation" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)}><span style={{ width: `${percent}%` }} /></div>
            <p>{progress?.currentChapterTitle ?? "Preparing your chapters…"}</p><p>{audiobookEtaText ?? "Estimating remaining time…"}</p>
          </div>}
          {error && <p role="alert" className={styles.error}>{error}</p>}
          {audiobookStatusUi === "cancelled" && <p role="status" className={styles.hint}>{effectiveAudiobookError ?? "Generation cancelled."}</p>}
          {!isAudiobookActive && audiobookStatusUi !== "idle" && <p role="status" className={styles.status}>{getAudiobookStatusLabel(audiobookStatusUi)}</p>}

          <button type="button" onClick={() => void handleGenerateAudiobook()} disabled={cannotGenerate} className={styles.generate}>
            {isAudiobookActive ? <Loader2 size={17} className={styles.spin} aria-hidden /> : <Headphones size={17} aria-hidden />}
            {!audiobookFeatureEnabled ? "Generation unavailable" : billingLoading ? "Checking subscription…" : isAudiobookActive ? "Generation in progress" : billingIsProActive ? "Generate audiobook" : "Continue to payment"}
          </button>
          {isAudiobookActive && <div className={styles.jobControls}>
            <button type="button" onClick={() => void handleAudiobookControl("pause")} disabled={!canPauseAudiobook}>{audiobookControlPending === "pause" ? "Pausing…" : "Pause"}</button>
            <button type="button" onClick={() => void handleAudiobookControl("resume")} disabled={!canResumeAudiobook}>{audiobookControlPending === "resume" ? "Resuming…" : "Resume"}</button>
            <button type="button" onClick={() => void handleAudiobookControl("cancel")} disabled={!canCancelAudiobook}>{audiobookControlPending === "cancel" ? "Cancelling…" : "Cancel"}</button>
          </div>}
          <p className={styles.hint}>{!audiobookFeatureEnabled ? "Audiobook generation is temporarily disabled." : "Creating audio does not publish your book. Listen and review before publishing."}</p>
        </aside>
      </div>
      <AudiobookCheckoutModal open={audiobookCheckoutModalOpen} onClose={() => setAudiobookCheckoutModalOpen(false)} audiobookError={audiobookError} audiobookCheckoutLoading={audiobookCheckoutLoading} onCheckout={() => void handleAudiobookCheckout()} />
    </div>
  );
}
