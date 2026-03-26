"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
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
    <div className="mx-auto max-w-4xl space-y-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-white/80">
        Cover
      </p>

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <input
          ref={coverInputRef}
          type="file"
          accept={ACCEPTED_COVER_TYPES}
          onChange={handleCoverChange}
          className="hidden"
          aria-hidden
        />
        <div>
          {displayCoverUrl ? (
            <>
              <div className="relative overflow-hidden rounded-2xl border border-slate-200 dark:border-white/[0.08]" style={{ aspectRatio: "3/4" }}>
                <Image
                  src={displayCoverUrl}
                  alt="Book cover"
                  fill
                  sizes="300px"
                  className="object-cover"
                  unoptimized
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => coverInputRef.current?.click()}
                  disabled={coverUploading}
                  className="rounded-xl border border-black/[0.08] bg-white px-3.5 py-2 text-[13px] font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white/70"
                >
                  Replace
                </button>
                <button
                  type="button"
                  onClick={() => setCoverCropSrc(displayCoverUrl)}
                  disabled={coverUploading}
                  className="rounded-xl border border-black/[0.08] bg-white px-3.5 py-2 text-[13px] font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white/70"
                >
                  Crop
                </button>
                <button
                  type="button"
                  onClick={handleRemoveCover}
                  disabled={coverUploading}
                  className="rounded-xl border border-red-200/60 bg-white px-3.5 py-2 text-[13px] font-medium text-red-500 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-900/30 dark:bg-white/[0.03] dark:text-red-400"
                >
                  Remove
                </button>
              </div>
            </>
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
                  : "border-slate-300 bg-white dark:border-white/20 dark:bg-white/[0.02] hover:border-slate-400 dark:hover:border-white/30"
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
              <div className="flex flex-col items-center justify-center gap-4 px-6 py-8">
                <span className="text-[14px] font-medium text-slate-500 dark:text-white/60">
                  Upload cover
                </span>
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-200 dark:bg-slate-700">
                  <svg className="h-6 w-6 text-slate-500 dark:text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                  </svg>
                </div>
                {coverUploading && (
                  <span className="text-xs text-slate-500 dark:text-white/50">Saving...</span>
                )}
              </div>
            </div>
          )}
        </div>
        {coverError && (
          <p className="text-sm text-red-600 dark:text-red-400 lg:col-span-2" role="alert">
            {coverError}
          </p>
        )}

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)] dark:border-white/[0.08] dark:bg-white/[0.03] dark:shadow-none">
          <h3 className="mb-4 text-[18px] font-medium text-slate-800 dark:text-white/90">
            Generate with AI
          </h3>
          <div className="mb-4">
            <label htmlFor="cover-ai-prompt" className="mb-1.5 block text-[13px] font-medium text-slate-700 dark:text-white/80">
              Prompt
            </label>
            <textarea
              id="cover-ai-prompt"
              value={coverAIPrompt}
              onChange={(e) => {
                setCoverAIPrompt(e.target.value);
                if (coverAIError) setCoverAIError(null);
              }}
              placeholder="Describe the cover you want..."
              rows={4}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[13px] text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none dark:border-white/[0.12] dark:bg-white/[0.04] dark:text-white dark:placeholder:text-white/40"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <label htmlFor="cover-ai-style" className="sr-only">Style</label>
              <select
                id="cover-ai-style"
                value={coverAIStyle}
                onChange={(e) => {
                  setCoverAIStyle(e.target.value);
                  if (coverAIError) setCoverAIError(null);
                }}
                className="appearance-none rounded-xl border border-slate-200 bg-white px-4 py-2.5 pr-9 text-[13px] font-medium text-slate-700 focus:border-slate-400 focus:outline-none dark:border-white/[0.12] dark:bg-white/[0.04] dark:text-white/80"
              >
                {COVER_AI_STYLES.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <svg className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 dark:text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" />
              </svg>
            </div>
            <button
              type="button"
              onClick={handleCoverAIGenerate}
              disabled={coverAIGenerating}
              className="rounded-xl bg-[#907AFF] px-5 py-2.5 text-[13px] font-semibold text-white shadow-sm transition-all hover:bg-[#7B6BF0] hover:shadow-md disabled:opacity-50"
            >
              {coverAIGenerating ? "Generating..." : "Generate"}
            </button>
          </div>
          {coverAIError && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400" role="alert">
              {coverAIError}
            </p>
          )}

          {/* AI preview overlay */}
          {coverAIPreviewUrl && (
            <div className="mt-4 rounded-xl border border-[#907AFF]/30 bg-[#907AFF]/5 p-4 dark:border-[#907AFF]/20 dark:bg-[#907AFF]/10">
              <p className="mb-3 text-[13px] font-medium text-slate-700 dark:text-white/80">Preview</p>
              <div className="mx-auto w-[180px]">
                <div className="relative aspect-[3/4] overflow-hidden rounded-xl border border-slate-200 dark:border-white/[0.08]">
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
              <div className="mt-3 flex justify-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    handleCoverSetFromGenerated(coverAIPreviewUrl);
                    setCoverAIPreviewUrl(null);
                  }}
                  disabled={coverUploading}
                  className="rounded-xl bg-[#907AFF] px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-[#7B6BF0] disabled:opacity-50"
                >
                  {coverUploading ? "Saving..." : "Use as cover"}
                </button>
                <button
                  type="button"
                  onClick={() => setCoverAIPreviewUrl(null)}
                  className="rounded-xl border border-black/[0.08] px-4 py-2 text-[13px] font-medium text-slate-600 transition hover:bg-slate-50 dark:border-white/[0.08] dark:text-white/60"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {coverAIGeneratedUrls.length > 0 && !coverAIPreviewUrl && (
            <div className="mt-4">
              <span className="mb-2 block text-xs font-medium text-slate-500 dark:text-white/50">Generated covers — click to preview</span>
              <div className="grid grid-cols-2 gap-3">
                {coverAIGeneratedUrls.map((url, i) => (
                  <button
                    key={`${url}-${i}`}
                    type="button"
                    onClick={() => setCoverAIPreviewUrl(url)}
                    disabled={coverUploading}
                    className="relative aspect-[3/4] overflow-hidden rounded-xl border-2 border-transparent bg-slate-100 transition-all hover:border-[#907AFF] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#907AFF]/50 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white/[0.04]"
                  >
                    <Image
                      src={url}
                      alt={`Generated cover ${i + 1}`}
                      fill
                      sizes="200px"
                      className="object-cover"
                      unoptimized
                    />
                  </button>
                ))}
              </div>
            </div>
          )}
          {!coverAIGenerating && coverAIGeneratedUrls.length === 0 && !coverAIError && (
            <p className="mt-3 text-[13px] text-slate-500 dark:text-white/50">
              No generated covers yet. Add a prompt, choose a style, and generate 4 options.
            </p>
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
