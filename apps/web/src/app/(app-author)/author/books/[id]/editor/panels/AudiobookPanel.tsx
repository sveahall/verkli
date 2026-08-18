"use client";

import dynamic from "next/dynamic";
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
  AudiobookLanguageList,
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
  latestAudiobookManifestUrl: string | null;
}

export default function AudiobookPanel({
  bookId,
  bookLanguage,
  bookOriginalLanguage,
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
  audiobookSelectedLanguages,
  setAudiobookSelectedLanguages,
  audiobookCheckoutModalOpen,
  setAudiobookCheckoutModalOpen,
  audiobookCheckoutLoading,
  handleAudiobookCheckout,
  shouldShowGeneratedAudiobookPlayer,
  fallbackGeneratedAudiobookUrl,
  latestAudiobookManifestUrl,
}: AudiobookPanelProps) {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-slate-800 dark:text-white/70">AUDIOBOOK PREVIEW</h2>

      {/*
        Language badge (read-only — tied to the active book version).

        There used to be a "Voice" and a "Tone" dropdown here. Both were
        decorative: the options were hardcoded (Ryan/Emma/Alex,
        neutral/warm/dramatic), neither value was ever put in the generate
        request body, and the server always narrates with the voice from
        deployment config. The three names were also Qwen speaker names from a
        deleted TTS stack, so wiring them through would have sent ElevenLabs
        voice ids it rejects. Per-book voice selection needs a real voice
        catalogue (see /api/author/voices) and provider support for tone — it
        is a feature to build, not a control to fake.
      */}
      <div className="flex flex-wrap gap-4">
        <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-900 dark:border-white/[0.1] dark:bg-white/[0.04] dark:text-white">
          {getLanguageLabel(normalizeLanguage(activeVersion?.language_code ?? activeLanguage))}
        </div>
      </div>

      {/* Audio preview player */}
      <AudiobookPreviewPlayer
        audioUrl={shouldShowGeneratedAudiobookPlayer ? fallbackGeneratedAudiobookUrl : null}
        bookId={bookId}
      />

      {/* Two cards side by side */}
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        {/* Left card: Generate audiobook */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-white/[0.06] dark:bg-white/[0.03]">
          <h3 className="text-xl font-semibold text-slate-900 dark:text-white">Increase your sales</h3>
          <p className="mt-1.5 text-sm text-slate-500 dark:text-white/50">Turn your book into a professional audiobook</p>

          {/* Info box */}
          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/80 p-5 dark:border-white/[0.06] dark:bg-white/[0.03]">
            <p className="text-[15px] text-slate-700 dark:text-white/70">
              Languages: <span className="font-semibold">{getLanguageLabel(normalizeLanguage(activeVersion?.language_code ?? activeLanguage))}</span>
            </p>
            <p className="mt-2 text-[15px] text-slate-700 dark:text-white/70">
              Estimated audiobook length: <span className="font-medium">~{(() => {
                const totalMinutes = Math.round(totalBookWordCount / 150);
                const hours = Math.floor(totalMinutes / 60);
                const mins = totalMinutes % 60;
                if (hours > 0) return `${hours}h ${mins}min`;
                return mins > 0 ? `${mins}min` : "< 1min";
              })()}</span>
            </p>
            <p className="mt-2 text-[15px] text-slate-700 dark:text-white/70">
              Estimated generation time: <span className="font-medium">~{(() => {
                const audiobookMinutes = Math.round(totalBookWordCount / 150);
                const genMinutes = Math.max(1, Math.round(audiobookMinutes * 0.15));
                return `${genMinutes}min`;
              })()}</span>
            </p>
            <p className="mt-3 flex items-center gap-1.5 text-[15px] font-medium text-slate-800 dark:text-white/80">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M5 13l4 4L19 7" /></svg>
              Included in PRO
            </p>
          </div>

          {/* Generation progress */}
          {isAudiobookActive && effectiveAudiobookProgress && (
            <div className="mt-4">
              <div className="mb-1 flex justify-between text-xs text-slate-600 dark:text-slate-400">
                <span>{effectiveAudiobookProgress.currentChapterTitle ?? "Processing..."}</span>
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
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                {audiobookEtaText ?? "Estimating remaining time..."}
              </p>
            </div>
          )}

          {/* Error messages */}
          {audiobookStatusUi === "cancelled" && (
            <p className="mt-3 text-xs text-slate-600 dark:text-slate-300">{effectiveAudiobookError ?? "Generation cancelled."}</p>
          )}
          {audiobookStatusUi === "failed" && (
            <p className="mt-3 text-xs text-red-600 dark:text-red-400">{effectiveAudiobookError ?? "Could not create audiobook. Try again."}</p>
          )}
          {audiobookError && audiobookStatusUi !== "failed" && audiobookStatusUi !== "cancelled" && (
            <p className="mt-3 text-xs text-red-600 dark:text-red-400">{audiobookError}</p>
          )}

          {/* Generate button */}
          <button
            type="button"
            onClick={() => void handleGenerateAudiobook()}
            disabled={isAudiobookActive || !audiobookFeatureEnabled || billingLoading || (billingIsProActive && audiobookScope !== "book" && audiobookRequestedChapterIds.length === 0)}
            className="mt-5 rounded-xl bg-[#0F172A] px-8 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1E293B] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {!audiobookFeatureEnabled
              ? "Generate audiobook (unavailable)"
              : billingLoading
              ? "Checking subscription..."
              : isAudiobookActive
              ? effectiveAudiobookProgress
                ? `Generating (${effectiveAudiobookProgress.completedChapters}/${effectiveAudiobookProgress.totalChapters})...`
                : "Queued..."
              : "Generate audiobook"}
          </button>

          {/* Status badge */}
          {audiobookStatusUi !== "idle" && !isAudiobookActive && (
            <div className="mt-4">
              <span
                className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${
                  audiobookStatusUi === "published"
                    ? "bg-[#907AFF]/15 text-[#5c4bb8] dark:bg-[#907AFF]/25 dark:text-[#b8a9ff]"
                    : audiobookStatusUi === "failed"
                      ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                      : audiobookStatusUi === "cancelled"
                        ? "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
                        : "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
                }`}
              >
                {getAudiobookStatusLabel(audiobookStatusUi)}
              </span>
            </div>
          )}

          {/* Scope selection (Pro only) */}
          {billingIsProActive && (
            <div className="mt-4 grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setAudiobookScope("book")}
                className={`rounded-full border px-3 py-2 text-xs font-medium transition ${
                  audiobookScope === "book"
                    ? "border-[#907AFF]/40 bg-[#907AFF]/10 text-[#5c4bb8]"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                Whole book
              </button>
              <button
                type="button"
                onClick={() => setAudiobookScope("current")}
                className={`rounded-full border px-3 py-2 text-xs font-medium transition ${
                  audiobookScope === "current"
                    ? "border-[#907AFF]/40 bg-[#907AFF]/10 text-[#5c4bb8]"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
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
                className={`rounded-full border px-3 py-2 text-xs font-medium transition ${
                  audiobookScope === "selected"
                    ? "border-[#907AFF]/40 bg-[#907AFF]/10 text-[#5c4bb8]"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                Select chapter
              </button>
            </div>
          )}

          {/* Chapter picker for selected scope */}
          {audiobookScope === "selected" && (
            <div className="mt-3 rounded-xl border border-slate-200 bg-white/70 p-3 dark:border-white/[0.08] dark:bg-white/[0.03]">
              <button
                type="button"
                onClick={() => setIsAudiobookChapterPickerOpen((prev) => !prev)}
                className="mb-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white"
              >
                {isAudiobookChapterPickerOpen ? "Hide chapter list" : "Show chapter list"}
              </button>
              {isAudiobookChapterPickerOpen && (
                <>
                  <div className="mb-2 flex flex-wrap gap-2">
                    <button type="button" onClick={() => setAudiobookSelectedChapterIds(chapters.map((ch) => ch.id))} className="rounded-md border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50">Select all</button>
                    <button type="button" onClick={() => setAudiobookSelectedChapterIds([])} className="rounded-md border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50">Clear</button>
                  </div>
                  <div className="max-h-44 space-y-1 overflow-y-auto pr-1">
                    {chapters.map((chapter) => (
                      <label key={chapter.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
                        <input
                          type="checkbox"
                          checked={audiobookSelectedChapterIds.includes(chapter.id)}
                          onChange={() => setAudiobookSelectedChapterIds((prev) => prev.includes(chapter.id) ? prev.filter((id) => id !== chapter.id) : [...prev, chapter.id])}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-[#907AFF] focus:ring-[#907AFF]"
                        />
                        <span className="truncate">{chapter.title || "Untitled chapter"}</span>
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Control buttons during generation */}
          {isAudiobookActive && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              <button type="button" onClick={() => void handleAudiobookControl("pause")} disabled={!canPauseAudiobook} className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
                {audiobookControlPending === "pause" ? "Pausing..." : "Pause"}
              </button>
              <button type="button" onClick={() => void handleAudiobookControl("resume")} disabled={!canResumeAudiobook} className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
                {audiobookControlPending === "resume" ? "Resuming..." : "Resume"}
              </button>
              <button type="button" onClick={() => void handleAudiobookControl("cancel")} disabled={!canCancelAudiobook} className="rounded-full border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50">
                {audiobookControlPending === "cancel" ? "Cancelling..." : "Cancel"}
              </button>
            </div>
          )}

          {!audiobookFeatureEnabled && (
            <p className="mt-2 text-xs text-slate-600 dark:text-white/60">
              Audiobook generation is temporarily disabled.
            </p>
          )}
        </div>

        {/* Right card: Languages */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-white/[0.06] dark:bg-white/[0.03]">
          <h3 className="text-xl font-semibold text-slate-900 dark:text-white">Audiobook in more languages:</h3>
          <AudiobookLanguageList
            bookLanguage={bookLanguage}
            bookOriginalLanguage={bookOriginalLanguage}
            audiobookSelectedLanguages={audiobookSelectedLanguages}
            setAudiobookSelectedLanguages={setAudiobookSelectedLanguages}
          />
        </div>
      </div>

      {/* Audiobook checkout modal */}
      <AudiobookCheckoutModal
        open={audiobookCheckoutModalOpen}
        onClose={() => setAudiobookCheckoutModalOpen(false)}
        audiobookError={audiobookError}
        audiobookCheckoutLoading={audiobookCheckoutLoading}
        onCheckout={() => void handleAudiobookCheckout()}
      />

      {/* Generated audiobook player (manifest-based) */}
      {shouldShowGeneratedAudiobookPlayer && !fallbackGeneratedAudiobookUrl && latestAudiobookManifestUrl && (
        <div className="mt-2">
          <ManifestAudiobookPlayer bookId={bookId} manifestUrl={latestAudiobookManifestUrl} />
        </div>
      )}
    </div>
  );
}
