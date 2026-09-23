"use client";

import Image from "next/image";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import styles from "./CoverPanel.module.css";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowRight, Check, ImageIcon, PenLine, Sparkles, Upload } from "lucide-react";
import { ACCEPTED_COVER_TYPES, COVER_AI_STYLES, COVER_TEMPLATES } from "../BookEditorView.helpers";
import { requiresUnoptimizedImage } from "@/lib/images/optimizable";
import type { CoverCopy } from "@/lib/cover-copy";
import type { CoverCopySaveState } from "../hooks/useCoverCopy";
import CoverCopyCard from "./CoverCopyCard";

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
  profileBio?: string;
  coverCopy?: CoverCopy;
  coverCopySaveState?: CoverCopySaveState;
  onCoverCopyChange?: (next: CoverCopy) => void;
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
  profileBio = "",
  coverCopy,
  coverCopySaveState = "idle",
  onCoverCopyChange,
}: CoverPanelProps) {
  const previousTemplateRef = useRef(coverAITemplate ?? COVER_TEMPLATES[0]?.id ?? null);
  const selectedTemplate = coverAITemplate
    ? COVER_TEMPLATES.find((t) => t.id === coverAITemplate) ?? null
    : null;

  return (
    <div className={`mx-auto w-full max-w-[1120px] ${styles.root} ${demoMode ? "mt-6 space-y-5 px-6 sm:mt-8" : styles.panel}`}>
      {/* Step number/name dropped — the workflow stepper above already shows
          step position; keep only the pacing badge inside the hero copy. */}
      {/* ── Header (real-mode only — demo mode lets the panels speak for themselves) ── */}
      {!demoMode && (
        <header className={styles.heading}>
          <div>
            <h2 className="font-display text-[clamp(24px,3vw,32px)] font-medium tracking-tight text-foreground">Give your story a cover.</h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">Upload your artwork or explore a new direction with AI. You choose what makes the final cut.</p>
          </div>
          <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground"><ImageIcon size={15} aria-hidden /> Cover studio</span>
        </header>
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

      <div className={demoMode ? "grid items-stretch gap-6 pt-2 lg:grid-cols-[minmax(260px,320px)_1fr]" : styles.layout}>
        {/* ── Cover preview ── */}
        <div className={demoMode ? "flex flex-col" : styles.preview}>
          {!demoMode && <div className={styles.previewLabel}><span>Digital cover</span><span>{displayCoverUrl ? "In use" : "Your canvas"}</span></div>}
          {/* Demo pitch: the cover is driven by a local asset (decoupled from
              Supabase for wifi-resilience). demoCoverUrl carries the seeded
              fallback, any local edit/upload, or null once the presenter
              removes it — which surfaces the upload + Generate empty state. */}
          {(demoMode ? demoCoverUrl : displayCoverUrl) ? (
            <div className={demoMode ? "flex h-full flex-col" : styles.currentCover}>
              <div
                className={`relative overflow-hidden ${
                  demoMode
                    ? "rounded-3xl ring-1 ring-border/70 dark:ring-white/[0.08]"
                    : styles.artwork
                }`}
                style={{ aspectRatio: "3/4" }}
              >
                <Image
                  src={demoMode ? demoCoverUrl ?? "" : displayCoverUrl ?? ""}
                  alt={`Cover of ${bookTitle}`}
                  fill
                  sizes="320px"
                  className="object-contain"
                  unoptimized={requiresUnoptimizedImage(demoMode ? demoCoverUrl ?? "" : displayCoverUrl ?? "")}
                  priority={demoMode}
                />
              </div>
              {!demoMode && (
              <div className={styles.coverActions}>
                <button
                  type="button"
                  onClick={() => coverInputRef.current?.click()}
                  disabled={coverUploading}
                  className="flex-1 rounded-xl border border-black/[0.08] bg-card py-2.5 text-xs font-medium text-muted-foreground transition hover:bg-background hover:border-black/[0.12] active:scale-[0.97] disabled:opacity-50 dark:border-border dark:bg-card dark:text-foreground"
                >
                  Replace
                </button>
                <button
                  type="button"
                  onClick={() => setCoverEditorOpen(true)}
                  disabled={coverUploading}
                  className="flex-1 inline-flex items-center justify-center gap-1 rounded-xl border border-[#907AFF]/20 bg-[#907AFF]/5 py-2.5 text-xs font-medium text-accent-foreground transition hover:bg-[#907AFF]/10 hover:border-[#907AFF]/30 active:scale-[0.97] disabled:opacity-50"
                >
                  <PenLine className="h-3 w-3" />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setCoverCropSrc(displayCoverUrl)}
                  disabled={coverUploading}
                  className="flex-1 rounded-xl border border-black/[0.08] bg-card py-2.5 text-xs font-medium text-muted-foreground transition hover:bg-background hover:border-black/[0.12] active:scale-[0.97] disabled:opacity-50 dark:border-border dark:bg-card dark:text-foreground"
                >
                  Crop
                </button>
                <button
                  type="button"
                  onClick={handleRemoveCover}
                  disabled={coverUploading}
                  className="rounded-xl border border-red-200/60 bg-card px-4 py-2.5 text-xs font-medium text-red-500 transition hover:bg-red-50 hover:border-red-300 active:scale-[0.97] disabled:opacity-50 dark:border-red-900/30 dark:bg-card dark:text-red-400"
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
                  className="flex-1 rounded-xl border border-black/[0.08] bg-card py-2.5 text-xs font-medium text-muted-foreground transition hover:bg-background hover:border-black/[0.12] active:scale-[0.97] dark:border-border dark:bg-card dark:text-foreground"
                >
                  Replace
                </button>
                <button
                  type="button"
                  onClick={() => setCoverEditorOpen(true)}
                  className="flex-1 inline-flex items-center justify-center gap-1 rounded-xl border border-[#907AFF]/20 bg-[#907AFF]/5 py-2.5 text-xs font-medium text-accent-foreground transition hover:bg-[#907AFF]/10 hover:border-[#907AFF]/30 active:scale-[0.97]"
                >
                  <PenLine className="h-3 w-3" />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setCoverCropSrc(demoCoverUrl)}
                  className="flex-1 rounded-xl border border-black/[0.08] bg-card py-2.5 text-xs font-medium text-muted-foreground transition hover:bg-background hover:border-black/[0.12] active:scale-[0.97] dark:border-border dark:bg-card dark:text-foreground"
                >
                  Crop
                </button>
                <button
                  type="button"
                  onClick={() => handleDemoRemoveCover?.()}
                  className="rounded-xl border border-red-200/60 bg-card px-4 py-2.5 text-xs font-medium text-red-500 transition hover:bg-red-50 hover:border-red-300 active:scale-[0.97] dark:border-red-900/30 dark:bg-card dark:text-red-400"
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
              aria-disabled={coverUploading}
              aria-label={coverUploading ? "Saving cover" : "Upload cover"}
              className={`${!demoMode ? styles.upload : ""} flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring ${
                coverDropActive
                  ? "border-[#907AFF]/60 bg-[#907AFF]/5 dark:bg-[#907AFF]/10"
                  : "border-border bg-background/50 hover:border-[#907AFF]/40 hover:bg-[#907AFF]/[0.03] dark:border-border dark:bg-card dark:hover:border-[#907AFF]/30"
              } ${coverUploading ? "cursor-wait opacity-70" : ""}`}
              style={demoMode ? { aspectRatio: "3/4" } : undefined}
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
              onDrop={(event) => {
                if (coverUploading) { event.preventDefault(); setCoverDropActive(false); return; }
                handleCoverDrop(event);
              }}
            >
              <div className="flex flex-col items-center gap-3 px-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted dark:bg-card">
                  <Upload className="h-5 w-5 text-muted-foreground dark:text-muted-foreground" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-muted-foreground dark:text-muted-foreground">
                    Upload cover
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground dark:text-muted-foreground">
                    Choose a file or drop it here
                  </p>
                </div>
                {coverUploading && (
                  <span className="text-xs text-muted-foreground dark:text-muted-foreground">Saving...</span>
                )}
              </div>
            </div>
          )}
          {!demoMode && <div className={styles.coverCaption}>
            <p>{bookTitle || "Your book title"}</p>
            {authorName && <span>{authorName}</span>}
          </div>}
          {!demoMode && <p className={styles.previewHint}>JPG or PNG · 3:4 portrait<br />Recommended: 1800 × 2400 px</p>}
        </div>

        {/* ── AI generation ── */}
        <div className={demoMode ? "flex flex-col" : "space-y-5"}>
          {/* Demo mode: editorial, left-aligned, type-driven panel */}
          {demoMode ? (
            <div className="relative isolate flex h-full min-h-[420px] flex-col justify-between overflow-hidden rounded-3xl px-10 py-10 ring-1 ring-border/70 sm:px-12 sm:py-12 dark:ring-white/[0.08]">

              {/* Single warm wash — corner glow, not a centered orb */}


              {/* Middle zone: headline + body — left-aligned, editorial */}
              <div className="relative space-y-4">
                <h2
                  className="text-[40px] font-semibold leading-[0.98] tracking-[-0.028em] text-foreground sm:text-[52px]"
                >
                  A new look
                  <br />
                  for your story.
                </h2>
                <p className="max-w-[34ch] text-[14px] leading-relaxed text-muted-foreground">
                  Four variations from your title, synopsis, and genre.
                </p>
              </div>

              {/* Bottom zone: CTA + supporting meta */}
              <div className="relative flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleCoverAIGenerate}
                  disabled={coverAIGenerating}
                  className="group/btn relative inline-flex items-center gap-2 overflow-hidden rounded-full bg-primary px-6 py-3 text-[14px] font-medium text-primary-foreground transition-all duration-300 hover:bg-primary/90 hover:shadow-[0_1px_2px_rgba(15,23,42,0.2),0_18px_36px_-10px_rgba(15,23,42,0.5)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
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
                    className="basis-full mt-1 inline-flex w-fit items-center gap-2.5 rounded-full bg-card px-3.5 py-1.5 ring-1 ring-border/70"
                    aria-live="polite"
                  >
                    <span className="relative inline-flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--brand-violet)]/60" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--brand-violet)]" />
                    </span>
                    <span
                      key={coverAIPhase}
                      className="text-[11px] font-medium text-muted-foreground"
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
          <div className={styles.generator} aria-busy={coverAIGenerating}>
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-[#907AFF]/10 dark:bg-[#907AFF]/15">
                <Sparkles className="h-3.5 w-3.5 text-accent-foreground" />
              </div>
              <h3 className="text-sm font-semibold text-foreground dark:text-foreground">
                Explore a cover direction
              </h3>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Build a visual brief, then compare the AI variations. Your current cover stays in place until you choose a new one.</p>
            <div className={styles.briefModes} aria-label="Cover brief type">
              <button type="button" aria-pressed={coverAITemplate !== null} onClick={() => {
                if (coverAITemplate === null) setCoverAITemplate(previousTemplateRef.current);
                if (coverAIError) setCoverAIError(null);
              }}>Guided brief</button>
              <button type="button" aria-pressed={coverAITemplate === null} onClick={() => {
                if (coverAITemplate) previousTemplateRef.current = coverAITemplate;
                setCoverAITemplate(null);
                if (coverAIError) setCoverAIError(null);
              }}>My own prompt</button>
            </div>

            {/* Real (non-demo) AI form: template dropdown */}
            {!demoMode && coverAITemplate !== null && (
              <div className="mt-6 space-y-4">
                <div>
                  <label htmlFor="cover-template" className="mb-1.5 block text-xs font-medium text-muted-foreground dark:text-muted-foreground">
                    Starting point
                  </label>
                  <div className="relative">
                    <select
                      id="cover-template"
                      aria-describedby="cover-template-description"
                      value={coverAITemplate}
                      onChange={(e) => {
                        setCoverAITemplate(e.target.value);
                        setCoverAITemplateFields({});
                        if (coverAIError) setCoverAIError(null);
                      }}
                      className="w-full appearance-none rounded-xl border border-border bg-card px-4 py-2.5 pr-9 text-sm font-medium text-foreground focus:border-[#907AFF]/40 focus:outline-none focus:ring-2 focus:ring-[#907AFF]/10 dark:border-border dark:bg-card dark:text-foreground"
                    >
                      {COVER_TEMPLATES.map((t) => (
                        <option key={t.id} value={t.id}>{t.label}</option>
                      ))}
                    </select>
                    <svg className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground dark:text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" />
                    </svg>
                  </div>
                  <p id="cover-template-description" className="mt-2 text-xs leading-relaxed text-muted-foreground">{selectedTemplate?.description}</p>
                </div>

                {/* Template fields */}
                {selectedTemplate?.fields.map((field) => (
                  <div key={field.id}>
                    <label htmlFor={`cover-field-${field.id}`} className="mb-1.5 block text-xs font-medium text-muted-foreground dark:text-muted-foreground">
                      {field.label}
                    </label>
                    <textarea
                      id={`cover-field-${field.id}`}
                      rows={field.id === "colors" ? 2 : 3}
                      value={coverAITemplateFields[field.id] ?? ""}
                      onChange={(e) => {
                        setCoverAITemplateFields({ ...coverAITemplateFields, [field.id]: e.target.value });
                        if (coverAIError) setCoverAIError(null);
                      }}
                      placeholder={field.placeholder}
                      className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-[#907AFF]/40 focus:outline-none focus:ring-2 focus:ring-[#907AFF]/10 dark:border-border dark:bg-card dark:text-foreground dark:placeholder:text-muted-foreground"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Custom prompt textarea (real mode only) */}
            {!demoMode && coverAITemplate === null && (
              <div className="mt-6">
                <label htmlFor="cover-ai-prompt" className="mb-2 block text-xs font-medium text-muted-foreground dark:text-muted-foreground">
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
                  className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-[#907AFF]/40 focus:outline-none focus:ring-2 focus:ring-[#907AFF]/10 dark:border-border dark:bg-card dark:text-foreground dark:placeholder:text-muted-foreground"
                />
                <p className="mt-1.5 text-[11px] text-muted-foreground dark:text-muted-foreground">
                  Focus on the visual scene. You can add your title and author name in the cover editor.
                </p>
              </div>
            )}

            {/* Style + Generate (real mode only) */}
            {!demoMode && (
            <div className={styles.generateActions}>
              <div className="relative">
                <label htmlFor="cover-ai-style" className="mb-1.5 block text-xs font-medium text-muted-foreground">Visual style</label>
                <select
                  id="cover-ai-style"
                  value={coverAIStyle}
                  onChange={(e) => {
                    setCoverAIStyle(e.target.value);
                    if (coverAIError) setCoverAIError(null);
                  }}
                  className="appearance-none rounded-xl border border-border bg-card px-4 py-2.5 pr-9 text-xs font-medium text-foreground focus:border-[#907AFF]/40 focus:outline-none focus:ring-2 focus:ring-[#907AFF]/10 dark:border-border dark:bg-card dark:text-foreground"
                >
                  {COVER_AI_STYLES.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <svg className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground dark:text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" />
                </svg>
              </div>
              <Button type="button" onClick={handleCoverAIGenerate} isLoading={coverAIGenerating} loadingText="Generating covers" disabled={coverUploading} size="sm">
                <Sparkles className="h-4 w-4" aria-hidden /> Generate covers
              </Button>
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
                  className="text-xs font-medium text-foreground dark:text-foreground"
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
              <p className="mt-6 text-xs text-muted-foreground dark:text-muted-foreground">
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
              <p className="mb-4 text-xs font-semibold text-foreground dark:text-foreground">Preview</p>
              <div className="mx-auto w-[200px]">
                <div className="relative aspect-[3/4] overflow-hidden rounded-xl border border-border shadow-md dark:border-border">
                  <Image
                    src={coverAIPreviewUrl}
                    alt="AI cover preview"
                    fill
                    sizes="200px"
                    className="object-contain"
                    unoptimized={requiresUnoptimizedImage(coverAIPreviewUrl)}
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
                  className="rounded-xl bg-primary px-6 py-2.5 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 active:scale-[0.97] disabled:opacity-50"
                >
                  {coverUploading ? "Saving..." : "Use as cover"}
                </button>
                <button
                  type="button"
                  onClick={() => setCoverAIPreviewUrl(null)}
                  className="rounded-xl border border-black/[0.08] px-6 py-2.5 text-xs font-medium text-muted-foreground transition hover:bg-background active:scale-[0.97] dark:border-border dark:text-muted-foreground"
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
                <p className="text-xs font-medium text-muted-foreground dark:text-muted-foreground">
                  Choose a direction to preview
                </p>
                {coverAIGeneratedSource ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[var(--brand-violet)]/10 px-2 py-0.5 text-[10px] font-semibold text-[var(--brand-violet)]">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--brand-violet)]" aria-hidden />
                    {coverAIGeneratedSource === "fallback" ? "Example variations" : "Generated just now"}
                  </span>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-4 @min-[900px]/book-panel:grid-cols-4">
                {coverAIGeneratedUrls.map((url, i) => (
                  <button
                    key={`${url}-${i}`}
                    type="button"
                    onClick={() => setCoverAIPreviewUrl(url)}
                    aria-label={`Preview cover variation ${i + 1}`}
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
                    className="group relative aspect-[3/4] overflow-hidden rounded-xl border-2 border-transparent bg-muted shadow-sm transition duration-150 hover:-translate-y-0.5 hover:border-[#907AFF] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#907AFF]/50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-card"
                  >
                    <Image
                      src={url}
                      alt={`Generated cover ${i + 1}`}
                      fill
                      sizes="200px"
                      className="object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                      unoptimized={requiresUnoptimizedImage(url)}
                    />
                    <span className={styles.variationLabel}>{(demoMode ? demoCoverUrl : displayCoverUrl) === url ? <><Check size={13} aria-hidden /> In use</> : `Variation ${i + 1}`}</span>
                  </button>
                ))}
              </div>
              {demoMode && (
                <div className="mt-6 flex flex-col items-center gap-1.5">
                  <Link
                    href={`/author/books/${bookId}?panel=production`}
                    className="group inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-[13px] font-semibold text-primary-foreground shadow-[0_8px_22px_-6px_rgba(124,92,252,0.55)] transition hover:scale-[1.02] hover:bg-primary/90 active:scale-[0.98]"
                  >
                    Next · Produce everything
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </Link>
                  <p className="text-[11px] text-muted-foreground">Press 2 to jump</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {coverCopy && onCoverCopyChange && (
        <CoverCopyCard
          value={coverCopy}
          profileBio={profileBio}
          bookTitle={bookTitle}
          authorName={authorName}
          coverUrl={(demoMode ? demoCoverUrl : displayCoverUrl) ?? null}
          saveState={coverCopySaveState}
          onChange={onCoverCopyChange}
        />
      )}

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
