"use client";

import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowRight, ImageIcon, PenLine, Sparkles, Upload } from "lucide-react";
import { ACCEPTED_COVER_TYPES, COVER_AI_STYLES, COVER_TEMPLATES } from "../BookEditorView.helpers";

const CoverCropModal = dynamic(() => import("@/components/books/CoverCropModal"), { ssr: false });
const CoverEditorModal = dynamic(() => import("@/components/books/cover-editor/CoverEditorModal"), { ssr: false });

interface CoverPanelProps {
  coverInputRef: React.RefObject<HTMLInputElement | null>;
  coverUploading: boolean;
  coverError: string | null;
  displayCoverUrl: string | null;
  coverDropActive: boolean;
  setCoverDropActive: (v: boolean) => void;
  coverAIPrompt: string;
  setCoverAIPrompt: (v: string) => void;
  coverAIStyle: string;
  setCoverAIStyle: (v: string) => void;
  coverAIGeneratedUrls: string[];
  /** "live" or "fallback" when a generation has finished; null otherwise. Demo-only. */
  coverAIGeneratedSource?: "live" | "fallback" | null;
  /** Demo-only pacing phase used to render anticipation copy under the loader. */
  coverAIPhase?: "idle" | "analyzing" | "generating" | "rendering" | "done";
  /** Demo-only: when true, the AI form (template/prompt/style dropdowns) is replaced with a single big "Generate cover" button. */
  demoMode?: boolean;
  coverAIGenerating: boolean;
  coverAIError: string | null;
  setCoverAIError: (v: string | null) => void;
  coverCropSrc: string | null;
  setCoverCropSrc: (v: string | null) => void;
  coverAIPreviewUrl: string | null;
  setCoverAIPreviewUrl: (v: string | null) => void;
  /** Demo-only: effective locally-displayed cover URL (null once removed). */
  demoCoverUrl?: string | null;
  /** Demo-only: clears the local cover, revealing the empty + Generate state. */
  handleDemoRemoveCover?: () => void;
  handleRemoveCover: () => void;
  handleCropSave: (file: File) => Promise<void>;
  handleCoverChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleCoverDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  handleCoverAIGenerate: () => void;
  handleCoverSetFromGenerated: (url: string) => void;
  coverAITemplate: string | null;
  setCoverAITemplate: (v: string | null) => void;
  coverAITemplateFields: Record<string, string>;
  setCoverAITemplateFields: (v: Record<string, string>) => void;
  coverEditorOpen: boolean;
  setCoverEditorOpen: (v: boolean) => void;
  handleEditorSave: (file: File) => Promise<void>;
  bookId: string;
  bookTitle: string;
  authorName: string;
}

export default function CoverPanel({
  coverInputRef,
  coverUploading,
  coverError,
  displayCoverUrl,
  coverDropActive,
  setCoverDropActive,
  coverAIPrompt,
  setCoverAIPrompt,
  coverAIStyle,
  setCoverAIStyle,
  coverAIGeneratedUrls,
  coverAIGeneratedSource = null,
  coverAIPhase = "idle",
  demoMode = false,
  coverAIGenerating,
  coverAIError,
  setCoverAIError,
  coverCropSrc,
  setCoverCropSrc,
  coverAIPreviewUrl,
  setCoverAIPreviewUrl,
  demoCoverUrl = null,
  handleDemoRemoveCover,
  handleRemoveCover,
  handleCropSave,
  handleCoverChange,
  handleCoverDrop,
  handleCoverAIGenerate,
  handleCoverSetFromGenerated,
  coverAITemplate,
  setCoverAITemplate,
  coverAITemplateFields,
  setCoverAITemplateFields,
  coverEditorOpen,
  setCoverEditorOpen,
  handleEditorSave,
  bookId,
  bookTitle,
  authorName,
}: CoverPanelProps) {
  const selectedTemplate = coverAITemplate
    ? COVER_TEMPLATES.find((t) => t.id === coverAITemplate) ?? null
    : null;

  return (
    <div className={`mx-auto w-full max-w-[1080px] px-6 ${demoMode ? "mt-6 space-y-5 sm:mt-8" : "mt-10 space-y-8 sm:px-12"}`}>
      {/* Step number/name dropped — the workflow stepper above already shows
          step position; keep only the pacing badge inside the hero copy. */}
      {/* ── Header (real-mode only — demo mode lets the panels speak for themselves) ── */}
      {!demoMode && (
        <div>
          <div className="flex items-center justify-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#907AFF]/10 dark:bg-[#907AFF]/15">
              <ImageIcon className="h-4 w-4 text-[#907AFF]" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Book Cover
            </h2>
          </div>
          <p className="my-6 text-sm text-slate-500 justify-center text-center mx-auto dark:text-white/45">
            Upload your own cover image or generate one with AI. Recommended size: 1600 &times; 2400px (3:4 ratio).
          </p>
        </div>
      )}

      <input
        ref={coverInputRef}
        type="file"
        accept={ACCEPTED_COVER_TYPES}
        onChange={handleCoverChange}
        className="hidden"
        aria-hidden
      />

      {coverError && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-400" role="alert">
          {coverError}
        </p>
      )}

      <div className={`grid items-stretch ${demoMode ? "gap-6 pt-2 lg:grid-cols-[minmax(260px,320px)_1fr]" : "gap-8 pt-10 lg:grid-cols-[300px_1fr]"}`}>
        {/* ── Cover preview ── */}
        <div className={demoMode ? "flex flex-col" : ""}>
          {/* Demo pitch: the cover is driven by a local asset (decoupled from
              Supabase for wifi-resilience). demoCoverUrl carries the seeded
              fallback, any local edit/upload, or null once the presenter
              removes it — which surfaces the upload + Generate empty state. */}
          {(demoMode ? demoCoverUrl : displayCoverUrl) ? (
            <div className={demoMode ? "flex h-full flex-col" : "space-y-4"}>
              <div
                className={`relative overflow-hidden ${
                  demoMode
                    ? "rounded-3xl ring-1 ring-slate-200/70 dark:ring-white/[0.08]"
                    : "rounded-2xl border border-black/[0.06] dark:border-white/[0.08]"
                }`}
                style={{ aspectRatio: "3/4" }}
              >
                <Image
                  src={demoMode ? demoCoverUrl ?? "" : displayCoverUrl ?? ""}
                  alt="Book cover"
                  fill
                  sizes="320px"
                  className="object-cover"
                  unoptimized
                  priority={demoMode}
                />
              </div>
              {!demoMode && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => coverInputRef.current?.click()}
                  disabled={coverUploading}
                  className="flex-1 rounded-xl border border-black/[0.08] bg-white py-2.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 hover:border-black/[0.12] active:scale-[0.97] disabled:opacity-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white/70"
                >
                  Replace
                </button>
                <button
                  type="button"
                  onClick={() => setCoverEditorOpen(true)}
                  disabled={coverUploading}
                  className="flex-1 inline-flex items-center justify-center gap-1 rounded-xl border border-[#907AFF]/20 bg-[#907AFF]/5 py-2.5 text-xs font-medium text-[#907AFF] transition hover:bg-[#907AFF]/10 hover:border-[#907AFF]/30 active:scale-[0.97] disabled:opacity-50"
                >
                  <PenLine className="h-3 w-3" />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setCoverCropSrc(displayCoverUrl)}
                  disabled={coverUploading}
                  className="flex-1 rounded-xl border border-black/[0.08] bg-white py-2.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 hover:border-black/[0.12] active:scale-[0.97] disabled:opacity-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white/70"
                >
                  Crop
                </button>
                <button
                  type="button"
                  onClick={handleRemoveCover}
                  disabled={coverUploading}
                  className="rounded-xl border border-red-200/60 bg-white px-4 py-2.5 text-xs font-medium text-red-500 transition hover:bg-red-50 hover:border-red-300 active:scale-[0.97] disabled:opacity-50 dark:border-red-900/30 dark:bg-white/[0.03] dark:text-red-400"
                >
                  Remove
                </button>
              </div>
              )}
              {/* Demo cover controls — same affordances as the real page, but
                  wired to local-only handlers (no Supabase write) so the pitch
                  stays instant and offline-safe. */}
              {demoMode && (
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => coverInputRef.current?.click()}
                  className="flex-1 rounded-xl border border-black/[0.08] bg-white py-2.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 hover:border-black/[0.12] active:scale-[0.97] dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white/70"
                >
                  Replace
                </button>
                <button
                  type="button"
                  onClick={() => setCoverEditorOpen(true)}
                  className="flex-1 inline-flex items-center justify-center gap-1 rounded-xl border border-[#907AFF]/20 bg-[#907AFF]/5 py-2.5 text-xs font-medium text-[#907AFF] transition hover:bg-[#907AFF]/10 hover:border-[#907AFF]/30 active:scale-[0.97]"
                >
                  <PenLine className="h-3 w-3" />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setCoverCropSrc(demoCoverUrl)}
                  className="flex-1 rounded-xl border border-black/[0.08] bg-white py-2.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 hover:border-black/[0.12] active:scale-[0.97] dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white/70"
                >
                  Crop
                </button>
                <button
                  type="button"
                  onClick={() => handleDemoRemoveCover?.()}
                  className="rounded-xl border border-red-200/60 bg-white px-4 py-2.5 text-xs font-medium text-red-500 transition hover:bg-red-50 hover:border-red-300 active:scale-[0.97] dark:border-red-900/30 dark:bg-white/[0.03] dark:text-red-400"
                >
                  Remove
                </button>
              </div>
              )}
            </div>
          ) : (
            <div
              role="button"
              tabIndex={0}
              onClick={() => !coverUploading && coverInputRef.current?.click()}
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === " ") && !coverUploading) {
                  e.preventDefault();
                  coverInputRef.current?.click();
                }
              }}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-colors ${
                coverDropActive
                  ? "border-[#907AFF]/60 bg-[#907AFF]/5 dark:bg-[#907AFF]/10"
                  : "border-slate-200 bg-slate-50/50 hover:border-[#907AFF]/40 hover:bg-[#907AFF]/[0.03] dark:border-white/15 dark:bg-white/[0.02] dark:hover:border-[#907AFF]/30"
              } ${coverUploading ? "cursor-wait opacity-70" : ""}`}
              style={{ aspectRatio: "3/4" }}
              onDragOver={(e) => {
                e.preventDefault();
                if (!coverUploading) setCoverDropActive(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                  setCoverDropActive(false);
                }
              }}
              onDrop={handleCoverDrop}
            >
              <div className="flex flex-col items-center gap-3 px-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 dark:bg-white/[0.06]">
                  <Upload className="h-5 w-5 text-slate-400 dark:text-white/30" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-slate-600 dark:text-white/60">
                    Upload cover
                  </p>
                  <p className="mt-1 text-xs text-slate-400 dark:text-white/30">
                    Click or drag &amp; drop
                  </p>
                </div>
                {coverUploading && (
                  <span className="text-xs text-slate-500 dark:text-white/50">Saving...</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── AI generation ── */}
        <div className={demoMode ? "flex flex-col" : "space-y-5"}>
          {/* Demo mode: editorial, left-aligned, type-driven panel */}
          {demoMode ? (
            <div className="relative isolate flex h-full min-h-[420px] flex-col justify-between overflow-hidden rounded-3xl px-10 py-10 ring-1 ring-slate-200/70 sm:px-12 sm:py-12 dark:ring-white/[0.08]">

              {/* Single warm wash — corner glow, not a centered orb */}


              {/* Middle zone: headline + body — left-aligned, editorial */}
              <div className="relative space-y-4">
                <h2
                  className="text-[40px] font-semibold leading-[0.98] tracking-[-0.028em] text-slate-900 sm:text-[52px]"
                >
                  Cover, in
                  <br />
                  eight seconds.
                </h2>
                <p className="max-w-[34ch] text-[14px] leading-relaxed text-slate-500">
                  Four variations from your title, synopsis, and genre.
                </p>
              </div>

              {/* Bottom zone: CTA + supporting meta */}
              <div className="relative flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleCoverAIGenerate}
                  disabled={coverAIGenerating}
                  className="group/btn relative inline-flex items-center gap-2 overflow-hidden rounded-full bg-[#0F172A] px-6 py-3 text-[14px] font-medium text-white transition-all duration-300 hover:bg-[#1E293B] hover:shadow-[0_1px_2px_rgba(15,23,42,0.2),0_18px_36px_-10px_rgba(15,23,42,0.5)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <span
                    aria-hidden
                    className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover/btn:translate-x-full"
                  />
                  <Sparkles className="relative h-3.5 w-3.5" />
                  <span className="relative">
                    {coverAIGenerating ? "Generating…" : "Generate cover"}
                  </span>
                </button>

                {coverAIError && (
                  <p
                    className="basis-full rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs text-red-600"
                    role="alert"
                  >
                    {coverAIError}
                  </p>
                )}

                {coverAIGenerating && coverAIPhase !== "idle" && coverAIPhase !== "done" ? (
                  <div
                    className="basis-full mt-1 inline-flex w-fit items-center gap-2.5 rounded-full bg-white px-3.5 py-1.5 ring-1 ring-slate-200/70"
                    aria-live="polite"
                  >
                    <span className="relative inline-flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--brand-violet)]/60" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--brand-violet)]" />
                    </span>
                    <span
                      key={coverAIPhase}
                      className="text-[11px] font-medium text-slate-600"
                      style={{ animation: "demoCoverPhaseFade 280ms ease-out" }}
                    >
                      {coverAIPhase === "analyzing"
                        ? "Analyzing book context…"
                        : coverAIPhase === "generating"
                          ? "Generating cover variations…"
                          : "Rendering 4 styles…"}
                    </span>
                    <style>{`
                      @keyframes demoCoverPhaseFade {
                        0% { opacity: 0; transform: translateY(2px); }
                        100% { opacity: 1; transform: translateY(0); }
                      }
                    `}</style>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {!demoMode ? (
          <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-8 dark:border-white/[0.06] dark:bg-white/[0.02]">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-[#907AFF]/10 dark:bg-[#907AFF]/15">
                <Sparkles className="h-3.5 w-3.5 text-[#907AFF]" />
              </div>
              <h3 className="text-sm font-semibold text-slate-800 dark:text-white/90">
                Generate with AI
              </h3>
            </div>

            {/* Real (non-demo) AI form: template dropdown */}
            {!demoMode && coverAITemplate !== null && (
              <div className="mt-6 space-y-4">
                <div>
                  <label htmlFor="cover-template" className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-white/60">
                    Starting point
                  </label>
                  <div className="relative">
                    <select
                      id="cover-template"
                      value={coverAITemplate}
                      onChange={(e) => {
                        setCoverAITemplate(e.target.value);
                        setCoverAITemplateFields({});
                        if (coverAIError) setCoverAIError(null);
                      }}
                      className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-4 py-2.5 pr-9 text-sm font-medium text-slate-700 focus:border-[#907AFF]/40 focus:outline-none focus:ring-2 focus:ring-[#907AFF]/10 dark:border-white/[0.10] dark:bg-white/[0.04] dark:text-white/80"
                    >
                      {COVER_TEMPLATES.map((t) => (
                        <option key={t.id} value={t.id}>{t.label} — {t.description}</option>
                      ))}
                    </select>
                    <svg className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" />
                    </svg>
                  </div>
                </div>

                {/* Template fields */}
                {selectedTemplate?.fields.map((field) => (
                  <div key={field.id}>
                    <label htmlFor={`cover-field-${field.id}`} className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-white/60">
                      {field.label}
                    </label>
                    <input
                      id={`cover-field-${field.id}`}
                      type="text"
                      value={coverAITemplateFields[field.id] ?? ""}
                      onChange={(e) => {
                        setCoverAITemplateFields({ ...coverAITemplateFields, [field.id]: e.target.value });
                        if (coverAIError) setCoverAIError(null);
                      }}
                      placeholder={field.placeholder}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#907AFF]/40 focus:outline-none focus:ring-2 focus:ring-[#907AFF]/10 dark:border-white/[0.10] dark:bg-white/[0.04] dark:text-white dark:placeholder:text-white/30"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Custom prompt textarea (real mode only) */}
            {!demoMode && coverAITemplate === null && (
              <div className="mt-6">
                <label htmlFor="cover-ai-prompt" className="mb-2 block text-xs font-medium text-slate-600 dark:text-white/60">
                  Describe the cover you want
                </label>
                <textarea
                  id="cover-ai-prompt"
                  value={coverAIPrompt}
                  onChange={(e) => {
                    setCoverAIPrompt(e.target.value);
                    if (coverAIError) setCoverAIError(null);
                  }}
                  placeholder="Be specific: describe the scene, colors, mood, and key elements..."
                  rows={4}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#907AFF]/40 focus:outline-none focus:ring-2 focus:ring-[#907AFF]/10 dark:border-white/[0.10] dark:bg-white/[0.04] dark:text-white dark:placeholder:text-white/30"
                />
                <p className="mt-1.5 text-[11px] text-slate-400 dark:text-white/30">
                  Tip: focus on the visual scene, not text or layout — we handle typography automatically.
                </p>
              </div>
            )}

            {/* Toggle between template and custom (real mode only) */}
            {!demoMode && (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => {
                  if (coverAITemplate) {
                    setCoverAITemplate(null);
                  } else {
                    setCoverAITemplate(COVER_TEMPLATES[0]?.id ?? null);
                    setCoverAITemplateFields({});
                  }
                  if (coverAIError) setCoverAIError(null);
                }}
                className="text-xs font-medium text-slate-400 underline decoration-slate-300 underline-offset-2 transition-colors hover:text-[#907AFF] dark:text-white/40 dark:decoration-white/20 dark:hover:text-[#907AFF]"
              >
                {coverAITemplate ? "Write a custom prompt instead" : "Use a template instead"}
              </button>
            </div>
            )}

            {/* Style + Generate (real mode only) */}
            {!demoMode && (
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <div className="relative">
                <label htmlFor="cover-ai-style" className="sr-only">Style</label>
                <select
                  id="cover-ai-style"
                  value={coverAIStyle}
                  onChange={(e) => {
                    setCoverAIStyle(e.target.value);
                    if (coverAIError) setCoverAIError(null);
                  }}
                  className="appearance-none rounded-xl border border-slate-200 bg-white px-4 py-2.5 pr-9 text-xs font-medium text-slate-700 focus:border-[#907AFF]/40 focus:outline-none focus:ring-2 focus:ring-[#907AFF]/10 dark:border-white/[0.10] dark:bg-white/[0.04] dark:text-white/80"
                >
                  {COVER_AI_STYLES.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <svg className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" />
                </svg>
              </div>
              <button
                type="button"
                onClick={handleCoverAIGenerate}
                disabled={coverAIGenerating}
                className="inline-flex items-center gap-2 rounded-xl bg-[#0F172A] px-6 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#1E293B] hover:shadow-md active:scale-[0.97] disabled:opacity-50"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {coverAIGenerating ? "Generating..." : "Generate"}
              </button>
            </div>
            )}

            {!demoMode && coverAIError && (
              <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-400" role="alert">
                {coverAIError}
              </p>
            )}

            {/*
             * Real-mode anticipation loader (already rendered inline in the
             * demo-mode branch above). Same treatment, just lives outside
             * the simplified one-click panel.
             */}
            {!demoMode && coverAIGenerating && coverAIPhase !== "idle" && coverAIPhase !== "done" ? (
              <div
                className="mt-4 flex items-center gap-3 rounded-xl border border-[var(--brand-violet)]/20 bg-[var(--brand-violet)]/[0.04] px-4 py-3"
                aria-live="polite"
              >
                <span className="relative inline-flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--brand-violet)]/60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--brand-violet)]" />
                </span>
                <span
                  // key on phase forces a fresh fade on each tick.
                  key={coverAIPhase}
                  className="text-xs font-medium text-slate-700 dark:text-white/70"
                  style={{ animation: "demoCoverPhaseFade 280ms ease-out" }}
                >
                  {coverAIPhase === "analyzing"
                    ? "Analyzing book context…"
                    : coverAIPhase === "generating"
                      ? "Generating cover variations…"
                      : "Rendering 4 styles…"}
                </span>
                <style>{`
                  @keyframes demoCoverPhaseFade {
                    0% { opacity: 0; transform: translateY(2px); }
                    100% { opacity: 1; transform: translateY(0); }
                  }
                `}</style>
              </div>
            ) : null}

            {!coverAIGenerating && coverAIGeneratedUrls.length === 0 && !coverAIError && (
              <p className="mt-6 text-xs text-slate-400 dark:text-white/35">
                {coverAITemplate
                  ? "Customize the fields above, pick a style, and we'll generate 4 cover options."
                  : "Describe your ideal cover, choose a style, and we'll generate 4 options for you."}
              </p>
            )}
          </div>
          ) : null}

          {/* AI preview overlay */}
          {coverAIPreviewUrl && (
            <div className="rounded-2xl border border-[#907AFF]/20 bg-[#907AFF]/[0.04] p-6 dark:border-[#907AFF]/15 dark:bg-[#907AFF]/[0.06]">
              <p className="mb-4 text-xs font-semibold text-slate-700 dark:text-white/80">Preview</p>
              <div className="mx-auto w-[200px]">
                <div className="relative aspect-[3/4] overflow-hidden rounded-xl border border-slate-200 shadow-md dark:border-white/[0.08]">
                  <Image
                    src={coverAIPreviewUrl}
                    alt="AI cover preview"
                    fill
                    sizes="200px"
                    className="object-cover"
                    unoptimized
                  />
                </div>
              </div>
              <div className="mt-6 flex justify-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    handleCoverSetFromGenerated(coverAIPreviewUrl);
                    setCoverAIPreviewUrl(null);
                  }}
                  disabled={coverUploading}
                  className="rounded-xl bg-[#0F172A] px-6 py-2.5 text-xs font-semibold text-white transition hover:bg-[#1E293B] active:scale-[0.97] disabled:opacity-50"
                >
                  {coverUploading ? "Saving..." : "Use as cover"}
                </button>
                <button
                  type="button"
                  onClick={() => setCoverAIPreviewUrl(null)}
                  className="rounded-xl border border-black/[0.08] px-6 py-2.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 active:scale-[0.97] dark:border-white/[0.08] dark:text-white/60"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {coverAIGeneratedUrls.length > 0 && !coverAIPreviewUrl && (
            <div>
              <style>{`
                @keyframes demoCoverCardIn {
                  0% { opacity: 0; transform: translateY(8px) scale(0.96); }
                  60% { opacity: 1; }
                  100% { opacity: 1; transform: translateY(0) scale(1); }
                }
              `}</style>
              <div className="mb-4 flex items-center justify-between">
                <p className="text-xs font-medium text-slate-500 dark:text-white/50">
                  Generated covers — click to preview
                </p>
                {coverAIGeneratedSource ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[var(--brand-violet)]/10 px-2 py-0.5 text-[10px] font-semibold text-[var(--brand-violet)]">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--brand-violet)]" aria-hidden />
                    Generated just now
                  </span>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {coverAIGeneratedUrls.map((url, i) => (
                  <button
                    key={`${url}-${i}`}
                    type="button"
                    onClick={() => setCoverAIPreviewUrl(url)}
                    disabled={coverUploading}
                    // Demo: staggered entry, 250ms apart per index, only
                    // when the source is "fallback" (live results land all
                    // at once — no anticipation hold to spread out).
                    style={
                      coverAIGeneratedSource === "fallback"
                        ? {
                            animation: "demoCoverCardIn 360ms cubic-bezier(0.34, 1.56, 0.64, 1) both",
                            animationDelay: `${i * 250}ms`,
                          }
                        : undefined
                    }
                    className="group relative aspect-[3/4] overflow-hidden rounded-xl border-2 border-transparent bg-slate-100 shadow-sm transition duration-150 hover:-translate-y-0.5 hover:border-[#907AFF] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#907AFF]/50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white/[0.04]"
                  >
                    <Image
                      src={url}
                      alt={`Generated cover ${i + 1}`}
                      fill
                      sizes="200px"
                      className="object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                      unoptimized
                    />
                  </button>
                ))}
              </div>
              {demoMode && (
                <div className="mt-6 flex flex-col items-center gap-1.5">
                  <Link
                    href={`/author/books/${bookId}?panel=production`}
                    className="group inline-flex items-center gap-2 rounded-full bg-[var(--brand-violet)] px-5 py-2.5 text-[13px] font-semibold text-white shadow-[0_8px_22px_-6px_rgba(124,92,252,0.55)] transition hover:scale-[1.02] hover:bg-[var(--brand-violet-hover)] active:scale-[0.98]"
                  >
                    Next · Produce everything
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </Link>
                  <p className="text-[11px] text-slate-400">Press 2 to jump</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Crop modal */}
      {coverCropSrc && (
        <CoverCropModal
          src={coverCropSrc}
          onSave={handleCropSave}
          onClose={() => setCoverCropSrc(null)}
        />
      )}

      {/* Cover editor modal */}
      {coverEditorOpen && (demoMode ? demoCoverUrl : displayCoverUrl) && (
        <CoverEditorModal
          imageUrl={(demoMode ? demoCoverUrl : displayCoverUrl) as string}
          bookId={bookId}
          bookTitle={bookTitle}
          authorName={authorName}
          onSave={handleEditorSave}
          onClose={() => setCoverEditorOpen(false)}
        />
      )}
    </div>
  );
}
