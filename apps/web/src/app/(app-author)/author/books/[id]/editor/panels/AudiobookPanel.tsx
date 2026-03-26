"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { getLanguageLabel, LANGUAGE_OPTIONS, normalizeLanguage } from "@/lib/languages";
import {
  formatPlayerTime,
  getAudiobookStatusLabel,
} from "../BookEditorView.helpers";
import type {
  AudiobookControlAction,
  AudiobookGenerationScope,
  BookVersion,
  Chapter,
} from "../BookEditorView.types";

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
  // Billing state
  billingLoading: boolean;
  billingIsProActive: boolean;
  // Audiobook feature
  audiobookFeatureEnabled: boolean;
  // Audiobook generation state
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
  // Audiobook scope
  audiobookScope: AudiobookGenerationScope;
  setAudiobookScope: (v: AudiobookGenerationScope) => void;
  audiobookSelectedChapterIds: string[];
  setAudiobookSelectedChapterIds: React.Dispatch<React.SetStateAction<string[]>>;
  isAudiobookChapterPickerOpen: boolean;
  setIsAudiobookChapterPickerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  audiobookRequestedChapterIds: string[];
  // Audiobook control
  audiobookControlPending: AudiobookControlAction | null;
  canPauseAudiobook: boolean;
  canResumeAudiobook: boolean;
  canCancelAudiobook: boolean;
  handleAudiobookControl: (action: AudiobookControlAction) => Promise<void>;
  handleGenerateAudiobook: () => Promise<void>;
  // Audiobook language selection
  audiobookSelectedLanguages: string[];
  setAudiobookSelectedLanguages: React.Dispatch<React.SetStateAction<string[]>>;
  // Audiobook checkout
  audiobookCheckoutModalOpen: boolean;
  setAudiobookCheckoutModalOpen: (v: boolean) => void;
  audiobookCheckoutLoading: boolean;
  handleAudiobookCheckout: () => Promise<void>;
  // Generated audiobook player
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
  const router = useRouter();

  // Dropdown open states
  const [abLangOpen, setAbLangOpen] = useState(false);
  const [abVoiceOpen, setAbVoiceOpen] = useState(false);
  const [abToneOpen, setAbToneOpen] = useState(false);
  const abLangRef = useRef<HTMLDivElement>(null);
  const abVoiceRef = useRef<HTMLDivElement>(null);
  const abToneRef = useRef<HTMLDivElement>(null);

  // Audio preview state
  const [audiobookPreviewVoice, setAudiobookPreviewVoice] = useState("Ryan");
  const [audiobookPreviewTone, setAudiobookPreviewTone] = useState("neutral");
  const audiobookPreviewRef = useRef<HTMLAudioElement>(null);
  const [audiobookPreviewPlaying, setAudiobookPreviewPlaying] = useState(false);
  const [audiobookPreviewCurrentTime, setAudiobookPreviewCurrentTime] = useState(0);
  const [audiobookPreviewDuration, setAudiobookPreviewDuration] = useState(0);
  const [audiobookPreviewSpeed, setAudiobookPreviewSpeed] = useState(1.0);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-slate-800 dark:text-white/70">AUDIOBOOK PREVIEW</h2>

      {/* Dropdowns row */}
      <div className="flex flex-wrap gap-4">
        {/* Language dropdown */}
        <div className="relative" ref={abLangRef}>
          <button
            type="button"
            onClick={() => { setAbLangOpen((o) => !o); setAbVoiceOpen(false); setAbToneOpen(false); }}
            className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-[15px] font-medium text-slate-900 transition hover:border-slate-300 dark:border-white/[0.1] dark:bg-white/[0.04] dark:text-white"
            aria-haspopup="listbox"
            aria-expanded={abLangOpen}
          >
            <span>{getLanguageLabel(normalizeLanguage(activeVersion?.language_code ?? activeLanguage))}</span>
            <svg className={`h-4 w-4 text-slate-400 transition-transform ${abLangOpen ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
          </button>
          {abLangOpen && (
            <ul className="absolute left-0 top-full z-20 mt-1 min-w-[160px] overflow-hidden rounded-xl shadow-lg border border-slate-200 bg-white py-1 dark:border-white/[0.08] dark:bg-slate-900" role="listbox">
              {LANGUAGE_OPTIONS.map((opt) => (
                <li key={opt.value} role="option" aria-selected={normalizeLanguage(activeVersion?.language_code ?? activeLanguage) === opt.value}>
                  <button
                    type="button"
                    onClick={() => setAbLangOpen(false)}
                    className={`w-full px-4 py-2 text-left text-sm transition hover:bg-slate-50 dark:hover:bg-white/10 ${
                      normalizeLanguage(activeVersion?.language_code ?? activeLanguage) === opt.value ? "bg-[#907AFF]/8 font-medium text-[#5c4bb8] dark:bg-[#907AFF]/15 dark:text-[#b8a9ff]" : "text-slate-700 dark:text-white/80"
                    }`}
                  >
                    {opt.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Voice dropdown */}
        <div className="relative" ref={abVoiceRef}>
          <button
            type="button"
            onClick={() => { setAbVoiceOpen((o) => !o); setAbLangOpen(false); setAbToneOpen(false); }}
            className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-[15px] font-medium text-slate-900 transition hover:border-slate-300 dark:border-white/[0.1] dark:bg-white/[0.04] dark:text-white"
            aria-haspopup="listbox"
            aria-expanded={abVoiceOpen}
          >
            <span>{audiobookPreviewVoice === "Ryan" ? "Voice" : audiobookPreviewVoice}</span>
            <svg className={`h-4 w-4 text-slate-400 transition-transform ${abVoiceOpen ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
          </button>
          {abVoiceOpen && (
            <ul className="absolute left-0 top-full z-20 mt-1 min-w-[140px] overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-white/[0.08] dark:bg-slate-900" role="listbox">
              {[{ value: "Ryan", label: "Ryan" }, { value: "Emma", label: "Emma" }, { value: "Alex", label: "Alex" }].map((opt) => (
                <li key={opt.value} role="option" aria-selected={audiobookPreviewVoice === opt.value}>
                  <button
                    type="button"
                    onClick={() => { setAudiobookPreviewVoice(opt.value); setAbVoiceOpen(false); }}
                    className={`w-full px-4 py-2 text-left text-sm transition hover:bg-slate-50 dark:hover:bg-white/10 ${
                      audiobookPreviewVoice === opt.value ? "bg-[#907AFF]/8 font-medium text-[#5c4bb8] dark:bg-[#907AFF]/15 dark:text-[#b8a9ff]" : "text-slate-700 dark:text-white/80"
                    }`}
                  >
                    {opt.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Tone dropdown */}
        <div className="relative" ref={abToneRef}>
          <button
            type="button"
            onClick={() => { setAbToneOpen((o) => !o); setAbLangOpen(false); setAbVoiceOpen(false); }}
            className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-[15px] font-medium text-slate-900 transition hover:border-slate-300 dark:border-white/[0.1] dark:bg-white/[0.04] dark:text-white"
            aria-haspopup="listbox"
            aria-expanded={abToneOpen}
          >
            <span>{audiobookPreviewTone === "neutral" ? "Tone" : audiobookPreviewTone.charAt(0).toUpperCase() + audiobookPreviewTone.slice(1)}</span>
            <svg className={`h-4 w-4 text-slate-400 transition-transform ${abToneOpen ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
          </button>
          {abToneOpen && (
            <ul className="absolute left-0 top-full z-20 mt-1 min-w-[140px] overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-white/[0.08] dark:bg-slate-900" role="listbox">
              {[{ value: "neutral", label: "Neutral" }, { value: "warm", label: "Warm" }, { value: "dramatic", label: "Dramatic" }].map((opt) => (
                <li key={opt.value} role="option" aria-selected={audiobookPreviewTone === opt.value}>
                  <button
                    type="button"
                    onClick={() => { setAudiobookPreviewTone(opt.value); setAbToneOpen(false); }}
                    className={`w-full px-4 py-2 text-left text-sm transition hover:bg-slate-50 dark:hover:bg-white/10 ${
                      audiobookPreviewTone === opt.value ? "bg-[#907AFF]/8 font-medium text-[#5c4bb8] dark:bg-[#907AFF]/15 dark:text-[#b8a9ff]" : "text-slate-700 dark:text-white/80"
                    }`}
                  >
                    {opt.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Audio player */}
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 dark:border-white/[0.06] dark:bg-white/[0.03]">
        {/* Hidden audio element */}
        {shouldShowGeneratedAudiobookPlayer && fallbackGeneratedAudiobookUrl && (
          <audio
            ref={audiobookPreviewRef}
            src={fallbackGeneratedAudiobookUrl}
            onTimeUpdate={() => {
              if (audiobookPreviewRef.current) {
                setAudiobookPreviewCurrentTime(audiobookPreviewRef.current.currentTime);
              }
            }}
            onLoadedMetadata={() => {
              if (audiobookPreviewRef.current) {
                setAudiobookPreviewDuration(audiobookPreviewRef.current.duration);
              }
            }}
            onEnded={() => setAudiobookPreviewPlaying(false)}
          />
        )}

        {/* Progress bar */}
        <div className="mb-5">
          <div
            className="relative h-1 cursor-pointer rounded-full bg-slate-200/80 dark:bg-white/10"
            onClick={(e) => {
              if (!audiobookPreviewRef.current || !audiobookPreviewDuration) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
              audiobookPreviewRef.current.currentTime = ratio * audiobookPreviewDuration;
            }}
          >
            <div
              className="h-full rounded-full bg-[#907AFF]/40 transition-all"
              style={{ width: audiobookPreviewDuration > 0 ? `${(audiobookPreviewCurrentTime / audiobookPreviewDuration) * 100}%` : "0%" }}
            />
            <div
              className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-[#907AFF] shadow-sm transition-all"
              style={{ left: audiobookPreviewDuration > 0 ? `calc(${(audiobookPreviewCurrentTime / audiobookPreviewDuration) * 100}% - 6px)` : "0" }}
            />
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between">
          <span className="min-w-[90px] text-[15px] tabular-nums text-slate-500 dark:text-white/50">
            {formatPlayerTime(audiobookPreviewCurrentTime)} / {formatPlayerTime(audiobookPreviewDuration)}
          </span>
          <div className="flex items-center gap-4">
            {/* Previous */}
            <button
              type="button"
              onClick={() => {
                if (audiobookPreviewRef.current) {
                  audiobookPreviewRef.current.currentTime = Math.max(0, audiobookPreviewRef.current.currentTime - 30);
                }
              }}
              className="text-slate-400 transition hover:text-slate-600 dark:text-white/40 dark:hover:text-white/70"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm12 0v12l-8.5-6z" /></svg>
            </button>
            {/* Play/Pause */}
            <button
              type="button"
              onClick={() => {
                if (!audiobookPreviewRef.current) return;
                if (audiobookPreviewPlaying) {
                  audiobookPreviewRef.current.pause();
                  setAudiobookPreviewPlaying(false);
                } else {
                  void audiobookPreviewRef.current.play();
                  setAudiobookPreviewPlaying(true);
                }
              }}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-[#907AFF] text-white transition hover:bg-[#7c6ae6]"
            >
              {audiobookPreviewPlaying ? (
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
              ) : (
                <svg className="ml-0.5 h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
              )}
            </button>
            {/* Next */}
            <button
              type="button"
              onClick={() => {
                if (audiobookPreviewRef.current) {
                  audiobookPreviewRef.current.currentTime = Math.min(
                    audiobookPreviewRef.current.duration || 0,
                    audiobookPreviewRef.current.currentTime + 30
                  );
                }
              }}
              className="text-slate-400 transition hover:text-slate-600 dark:text-white/40 dark:hover:text-white/70"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" /></svg>
            </button>
          </div>
          {/* Speed */}
          <button
            type="button"
            onClick={() => {
              const speeds = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
              const idx = speeds.indexOf(audiobookPreviewSpeed);
              const next = speeds[(idx + 1) % speeds.length];
              setAudiobookPreviewSpeed(next);
              if (audiobookPreviewRef.current) {
                audiobookPreviewRef.current.playbackRate = next;
              }
            }}
            className="min-w-[40px] text-right text-[15px] font-medium tabular-nums text-slate-600 transition hover:text-slate-800 dark:text-white/60 dark:hover:text-white/80"
          >
            {audiobookPreviewSpeed === 1 ? "1.0" : audiobookPreviewSpeed}x
          </button>
        </div>
      </div>

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
            className="mt-5 rounded-xl bg-[#907AFF] px-8 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#7c6ae6] disabled:cursor-not-allowed disabled:opacity-50"
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
          <div className="mt-4 divide-y divide-slate-100 dark:divide-white/[0.06]">
            {(() => {
              const bookLang = normalizeLanguage(bookLanguage ?? bookOriginalLanguage);
              const sorted = [...LANGUAGE_OPTIONS].sort((a, b) =>
                a.value === bookLang ? -1 : b.value === bookLang ? 1 : 0
              );
              return sorted.map((lang) => {
                const isBookLang = bookLang === lang.value;
                const isChecked = audiobookSelectedLanguages.includes(lang.value);
                return (
                  <label key={lang.value} className="flex cursor-pointer items-center justify-between py-3.5 text-[15px] text-slate-700 dark:text-white/80">
                    <span>{lang.label}</span>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {
                        if (isBookLang) return;
                        setAudiobookSelectedLanguages((prev) =>
                          prev.includes(lang.value)
                            ? prev.filter((l) => l !== lang.value)
                            : [...prev, lang.value]
                        );
                      }}
                      disabled={isBookLang}
                      className="h-4 w-4 rounded border-slate-300 text-[#907AFF] focus:ring-[#907AFF] disabled:cursor-default dark:border-white/20"
                    />
                  </label>
                );
              });
            })()}
          </div>
        </div>
      </div>

      {/* Audiobook checkout modal for non-Pro */}
      {audiobookCheckoutModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setAudiobookCheckoutModalOpen(false); }}
        >
          <div className="relative mx-4 w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl dark:bg-slate-900">
            <button type="button" onClick={() => setAudiobookCheckoutModalOpen(false)} className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:text-white/40 dark:hover:text-white/70" aria-label="Close">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
            <h2 className="mb-6 text-center text-lg font-semibold text-slate-900 dark:text-white">Choose a plan to generate audiobook</h2>
            <div className="space-y-4">
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border-2 border-[#907AFF] bg-[#907AFF]/5 px-4 py-4 transition">
                <input type="radio" name="audiobook-plan-new" value="per_book" defaultChecked className="mt-0.5 h-4 w-4 accent-[#907AFF]" />
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">Pay per audiobook</p>
                  <p className="text-sm text-slate-500 dark:text-white/50">299 kr / book</p>
                </div>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border-2 border-slate-200 px-4 py-4 transition hover:border-slate-300 dark:border-white/10 dark:hover:border-white/20" onClick={() => { setAudiobookCheckoutModalOpen(false); router.push("/author/billing"); }}>
                <input type="radio" name="audiobook-plan-new" value="pro" className="mt-0.5 h-4 w-4 accent-[#907AFF]" />
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">Subscribe to PRO</p>
                  <p className="mb-2 text-sm text-slate-500 dark:text-white/50">2 490 kr / month</p>
                  <ul className="space-y-1 text-sm text-slate-600 dark:text-white/60">
                    {["Unlimited audiobooks", "Unlimited translations", "Chapter-level control", "Marketing tools"].map((f) => (
                      <li key={f} className="flex items-center gap-2">
                        <svg className="h-4 w-4 shrink-0 text-[#907AFF]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 13l4 4L19 7" /></svg>
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              </label>
            </div>
            {audiobookError && <p className="mt-4 text-center text-sm text-red-600 dark:text-red-400">{audiobookError}</p>}
            <button
              type="button"
              onClick={() => { setAudiobookCheckoutModalOpen(false); void handleAudiobookCheckout(); }}
              disabled={audiobookCheckoutLoading}
              className="mt-6 block w-full rounded-full bg-[#907AFF] px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#7c6ae6] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {audiobookCheckoutLoading ? "Redirecting..." : "Generate full audiobook"}
            </button>
          </div>
        </div>
      )}

      {/* Generated audiobook player */}
      {shouldShowGeneratedAudiobookPlayer && !fallbackGeneratedAudiobookUrl && latestAudiobookManifestUrl && (
        <div className="mt-2">
          <ManifestAudiobookPlayer bookId={bookId} manifestUrl={latestAudiobookManifestUrl} />
        </div>
      )}
    </div>
  );
}
