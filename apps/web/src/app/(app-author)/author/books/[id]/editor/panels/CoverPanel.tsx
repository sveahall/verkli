"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { ImageIcon, Sparkles, Upload } from "lucide-react";
import { ACCEPTED_COVER_TYPES, COVER_AI_STYLES } from "../BookEditorView.helpers";

const CoverCropModal = dynamic(() => import("@/components/books/CoverCropModal"), { ssr: false });

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
  coverAIGenerating: boolean;
  coverAIError: string | null;
  setCoverAIError: (v: string | null) => void;
  coverCropSrc: string | null;
  setCoverCropSrc: (v: string | null) => void;
  coverAIPreviewUrl: string | null;
  setCoverAIPreviewUrl: (v: string | null) => void;
  handleRemoveCover: () => void;
  handleCropSave: (file: File) => Promise<void>;
  handleCoverChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleCoverDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  handleCoverAIGenerate: () => void;
  handleCoverSetFromGenerated: (url: string) => void;
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
  coverAIGenerating,
  coverAIError,
  setCoverAIError,
  coverCropSrc,
  setCoverCropSrc,
  coverAIPreviewUrl,
  setCoverAIPreviewUrl,
  handleRemoveCover,
  handleCropSave,
  handleCoverChange,
  handleCoverDrop,
  handleCoverAIGenerate,
  handleCoverSetFromGenerated,
}: CoverPanelProps) {
  return (
    <div className="space-y-8">
      {/* ── Header ── */}
      <div>
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#907AFF]/10 dark:bg-[#907AFF]/15">
            <ImageIcon className="h-4 w-4 text-[#907AFF]" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Book Cover
          </h2>
        </div>
        <p className="mt-2 text-sm text-slate-500 dark:text-white/45">
          Upload your own cover image or generate one with AI. Recommended size: 1600 &times; 2400px (3:4 ratio).
        </p>
      </div>

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

      <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
        {/* ── Cover preview ── */}
        <div>
          {displayCoverUrl ? (
            <div className="space-y-4">
              <div className="relative overflow-hidden rounded-2xl border border-black/[0.06] shadow-[0_4px_20px_rgba(0,0,0,0.08)] dark:border-white/[0.08] dark:shadow-[0_4px_20px_rgba(0,0,0,0.3)]" style={{ aspectRatio: "3/4" }}>
                <Image
                  src={displayCoverUrl}
                  alt="Book cover"
                  fill
                  sizes="280px"
                  className="object-cover"
                  unoptimized
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => coverInputRef.current?.click()}
                  disabled={coverUploading}
                  className="flex-1 rounded-xl border border-black/[0.08] bg-white py-2 text-[13px] font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white/70"
                >
                  Replace
                </button>
                <button
                  type="button"
                  onClick={() => setCoverCropSrc(displayCoverUrl)}
                  disabled={coverUploading}
                  className="flex-1 rounded-xl border border-black/[0.08] bg-white py-2 text-[13px] font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white/70"
                >
                  Crop
                </button>
                <button
                  type="button"
                  onClick={handleRemoveCover}
                  disabled={coverUploading}
                  className="rounded-xl border border-red-200/60 bg-white px-3 py-2 text-[13px] font-medium text-red-500 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-900/30 dark:bg-white/[0.03] dark:text-red-400"
                >
                  Remove
                </button>
              </div>
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
              className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-all ${
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
        <div className="space-y-5">
          <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-6 dark:border-white/[0.06] dark:bg-white/[0.02]">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#907AFF]/10 dark:bg-[#907AFF]/15">
                <Sparkles className="h-3.5 w-3.5 text-[#907AFF]" />
              </div>
              <h3 className="text-[15px] font-semibold text-slate-800 dark:text-white/90">
                Generate with AI
              </h3>
            </div>

            <div className="mt-4">
              <label htmlFor="cover-ai-prompt" className="mb-1.5 block text-[13px] font-medium text-slate-600 dark:text-white/60">
                Describe the cover you want
              </label>
              <textarea
                id="cover-ai-prompt"
                value={coverAIPrompt}
                onChange={(e) => {
                  setCoverAIPrompt(e.target.value);
                  if (coverAIError) setCoverAIError(null);
                }}
                placeholder="A serene mountain landscape at sunset with a silhouette..."
                rows={3}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-[13px] text-slate-900 placeholder:text-slate-400 focus:border-[#907AFF]/40 focus:outline-none focus:ring-2 focus:ring-[#907AFF]/10 dark:border-white/[0.10] dark:bg-white/[0.04] dark:text-white dark:placeholder:text-white/30"
              />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <div className="relative">
                <label htmlFor="cover-ai-style" className="sr-only">Style</label>
                <select
                  id="cover-ai-style"
                  value={coverAIStyle}
                  onChange={(e) => {
                    setCoverAIStyle(e.target.value);
                    if (coverAIError) setCoverAIError(null);
                  }}
                  className="appearance-none rounded-xl border border-slate-200 bg-white px-4 py-2.5 pr-9 text-[13px] font-medium text-slate-700 focus:border-[#907AFF]/40 focus:outline-none focus:ring-2 focus:ring-[#907AFF]/10 dark:border-white/[0.10] dark:bg-white/[0.04] dark:text-white/80"
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
                className="inline-flex items-center gap-2 rounded-xl bg-[#907AFF] px-5 py-2.5 text-[13px] font-semibold text-white shadow-sm transition-all hover:bg-[#7B6BF0] hover:shadow-md disabled:opacity-50"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {coverAIGenerating ? "Generating..." : "Generate"}
              </button>
            </div>

            {coverAIError && (
              <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-400" role="alert">
                {coverAIError}
              </p>
            )}

            {!coverAIGenerating && coverAIGeneratedUrls.length === 0 && !coverAIError && (
              <p className="mt-4 text-[13px] text-slate-400 dark:text-white/35">
                Describe your ideal cover, choose a style, and we&apos;ll generate 4 options for you.
              </p>
            )}
          </div>

          {/* AI preview overlay */}
          {coverAIPreviewUrl && (
            <div className="rounded-2xl border border-[#907AFF]/20 bg-[#907AFF]/[0.04] p-5 dark:border-[#907AFF]/15 dark:bg-[#907AFF]/[0.06]">
              <p className="mb-3 text-[13px] font-semibold text-slate-700 dark:text-white/80">Preview</p>
              <div className="mx-auto w-[180px]">
                <div className="relative aspect-[3/4] overflow-hidden rounded-xl border border-slate-200 shadow-sm dark:border-white/[0.08]">
                  <Image
                    src={coverAIPreviewUrl}
                    alt="AI cover preview"
                    fill
                    sizes="180px"
                    className="object-cover"
                    unoptimized
                  />
                </div>
              </div>
              <div className="mt-4 flex justify-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    handleCoverSetFromGenerated(coverAIPreviewUrl);
                    setCoverAIPreviewUrl(null);
                  }}
                  disabled={coverUploading}
                  className="rounded-xl bg-[#907AFF] px-5 py-2.5 text-[13px] font-semibold text-white transition hover:bg-[#7B6BF0] disabled:opacity-50"
                >
                  {coverUploading ? "Saving..." : "Use as cover"}
                </button>
                <button
                  type="button"
                  onClick={() => setCoverAIPreviewUrl(null)}
                  className="rounded-xl border border-black/[0.08] px-5 py-2.5 text-[13px] font-medium text-slate-600 transition hover:bg-slate-50 dark:border-white/[0.08] dark:text-white/60"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {coverAIGeneratedUrls.length > 0 && !coverAIPreviewUrl && (
            <div>
              <p className="mb-3 text-[13px] font-medium text-slate-500 dark:text-white/50">
                Generated covers — click to preview
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {coverAIGeneratedUrls.map((url, i) => (
                  <button
                    key={`${url}-${i}`}
                    type="button"
                    onClick={() => setCoverAIPreviewUrl(url)}
                    disabled={coverUploading}
                    className="group relative aspect-[3/4] overflow-hidden rounded-xl border-2 border-transparent bg-slate-100 transition-all hover:border-[#907AFF] hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[#907AFF]/50 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white/[0.04]"
                  >
                    <Image
                      src={url}
                      alt={`Generated cover ${i + 1}`}
                      fill
                      sizes="200px"
                      className="object-cover transition-transform group-hover:scale-[1.02]"
                      unoptimized
                    />
                  </button>
                ))}
              </div>
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
    </div>
  );
}
