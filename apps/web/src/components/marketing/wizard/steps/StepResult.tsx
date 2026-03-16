"use client";

import { useEffect, useRef, useState } from "react";
import { useTrailerWizard } from "@/components/marketing/wizard/WizardContext";
import { MAX_REGENERATE_ATTEMPTS } from "@/components/marketing/wizard/wizard-machine";

const BUILDING_LABELS = [
  "Genererar scener...",
  "Sätter ihop video...",
  "Lägger till ljud...",
  "Laddar upp...",
];

export default function StepResult() {
  const {
    state,
    canGoBack,
    goBack,
    generateScenes,
    regenerateScenes,
    fetchQuota,
    buildTrailer,
    resetBuild,
  } = useTrailerWizard();

  const hasTriggeredGenerate = useRef(false);
  const hasFetchedQuota = useRef(false);
  const [buildLabelIndex, setBuildLabelIndex] = useState(0);
  const [captionCopied, setCaptionCopied] = useState(false);

  // Auto-generate scenes on entry
  useEffect(() => {
    if (state.generate.status === "idle" && !hasTriggeredGenerate.current) {
      hasTriggeredGenerate.current = true;
      void generateScenes();
    }
  }, [state.generate.status, generateScenes]);

  // Rotating build labels
  useEffect(() => {
    if (state.build.status !== "building") return;
    const interval = setInterval(() => {
      setBuildLabelIndex((prev) => (prev + 1) % BUILDING_LABELS.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [state.build.status]);

  const isGenerating = state.generate.status === "loading";
  const isGenReady = state.generate.status === "ready";
  const isGenError = state.generate.status === "error";
  const canRegenerate =
    state.generate.regenerateCount < MAX_REGENERATE_ATTEMPTS && !isGenerating;

  const isBuilding = state.build.status === "building";
  const isCompleted = state.build.status === "completed";
  const isBuildError = state.build.status === "error";
  const isConfirming =
    state.build.status === "confirming" ||
    state.build.status === "fetching_quota";
  const quotaExhausted =
    state.build.isProUser &&
    state.build.quotaUsed >= state.build.quotaLimit;

  const totalDuration = state.generate.scenes.reduce(
    (sum, s) => sum + s.duration,
    0
  );

  function handleStartBuild() {
    if (!hasFetchedQuota.current) {
      hasFetchedQuota.current = true;
      void fetchQuota();
    }
  }

  function handleCopyCaption() {
    if (state.build.caption) {
      void navigator.clipboard.writeText(state.build.caption);
      setCaptionCopied(true);
      setTimeout(() => setCaptionCopied(false), 2000);
    }
  }

  // ── Generating scenes ──────────────────────────────────────────────────
  if (isGenerating) {
    return (
      <section className="space-y-4">
        <div className="card-base p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#907AFF]/10 dark:bg-[#907AFF]/20">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#907AFF]/30 border-t-[#907AFF]" />
            </div>
            <div>
              <h2 className="text-[16px] font-semibold text-slate-900 dark:text-white">
                Genererar scener
              </h2>
              <p className="mt-0.5 text-[13px] text-slate-500 dark:text-white/50">
                AI:n analyserar din bok och skapar visuella scener...
              </p>
            </div>
          </div>
          <div className="mt-6 space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-20 animate-pulse rounded-xl bg-slate-100 dark:bg-white/5"
                style={{ animationDelay: `${i * 150}ms` }}
              />
            ))}
          </div>
        </div>
      </section>
    );
  }

  // ── Generation error ───────────────────────────────────────────────────
  if (isGenError) {
    return (
      <section className="space-y-4">
        <div className="card-base border-red-200 p-6 dark:border-red-500/30">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50 dark:bg-red-950/30">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                className="text-red-500"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <path
                  d="M15 9L9 15M9 9l6 6"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-[15px] font-semibold text-red-700 dark:text-red-300">
                Kunde inte generera scener
              </p>
              <p className="mt-1 text-[13px] text-red-600 dark:text-red-400">
                {state.generate.errorMessage}
              </p>
              {canRegenerate && (
                <button
                  type="button"
                  onClick={() => void regenerateScenes()}
                  className="btn-primary mt-3"
                >
                  Försök igen
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="flex justify-start">
          <button
            type="button"
            onClick={goBack}
            disabled={!canGoBack}
            className="rounded-xl border border-slate-200 px-4 py-2 text-[13px] font-semibold text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/20 dark:text-white/80 dark:hover:border-white/30"
          >
            Tillbaka
          </button>
        </div>
      </section>
    );
  }

  // ── Building trailer ───────────────────────────────────────────────────
  if (isBuilding) {
    return (
      <section className="space-y-4">
        <div className="card-base flex flex-col items-center p-10">
          <div className="relative h-16 w-16">
            <div className="absolute inset-0 animate-ping rounded-full bg-[#907AFF]/20" />
            <div className="absolute inset-1 animate-pulse rounded-full bg-[#907AFF]/10" />
            <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#907AFF] to-[#6C5CE7]">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                className="text-white"
              >
                <path
                  d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>
          <p className="mt-5 text-[16px] font-semibold text-slate-900 dark:text-white">
            {BUILDING_LABELS[buildLabelIndex]}
          </p>
          <p className="mt-1 text-[13px] text-slate-500 dark:text-white/50">
            Detta tar ungefär 2-3 minuter.
          </p>
          <div className="mt-4 flex gap-1.5">
            {BUILDING_LABELS.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 w-1.5 rounded-full transition-colors ${
                  i <= buildLabelIndex
                    ? "bg-[#907AFF]"
                    : "bg-slate-200 dark:bg-white/10"
                }`}
              />
            ))}
          </div>
          <p className="mt-5 text-[12px] text-slate-400 dark:text-white/30">
            Du kan lämna sidan — trailern fortsätter att byggas i bakgrunden.
          </p>
        </div>
      </section>
    );
  }

  // ── Completed ──────────────────────────────────────────────────────────
  if (isCompleted) {
    return (
      <section className="space-y-4">
        <div className="card-base p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/30">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                className="text-emerald-500"
              >
                <path
                  d="M22 11.08V12a10 10 0 11-5.93-9.14"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                <path
                  d="M22 4L12 14.01l-3-3"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div>
              <h2 className="text-[16px] font-semibold text-slate-900 dark:text-white">
                Din trailer är klar!
              </h2>
              <p className="mt-0.5 text-[13px] text-slate-500 dark:text-white/50">
                Ladda ner eller dela din boktrailer.
              </p>
            </div>
          </div>

          {state.build.videoUrl && (
            <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 dark:border-white/10">
              <video
                src={state.build.videoUrl}
                controls
                autoPlay
                muted
                playsInline
                className="h-auto w-full bg-black"
              />
            </div>
          )}

          {state.build.caption && (
            <div className="mt-5">
              <div className="flex items-center justify-between">
                <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-white/40">
                  Bildtext
                </p>
                <button
                  type="button"
                  onClick={handleCopyCaption}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-600 transition hover:border-slate-300 dark:border-white/20 dark:text-white/70 dark:hover:border-white/30"
                >
                  {captionCopied ? "Kopierat!" : "Kopiera"}
                </button>
              </div>
              <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700 dark:text-white/80">
                  {state.build.caption}
                </p>
              </div>
            </div>
          )}

          {state.generate.hashtags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {state.generate.hashtags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] text-slate-500 dark:border-white/15 dark:bg-white/5 dark:text-white/50"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-5 dark:border-white/5">
            {state.build.videoUrl && (
              <a
                href={state.build.videoUrl}
                download
                className="flex items-center gap-2 rounded-full bg-gradient-to-r from-[#907AFF] to-[#6C5CE7] px-5 py-2.5 text-[13px] font-semibold text-white shadow-sm transition hover:shadow-md active:scale-[0.98]"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <path
                    d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Ladda ner
              </a>
            )}
            <button
              type="button"
              onClick={resetBuild}
              className="flex items-center gap-2 rounded-full border border-slate-200 px-5 py-2.5 text-[13px] font-semibold text-slate-700 transition hover:border-slate-300 dark:border-white/20 dark:text-white/80 dark:hover:border-white/30"
            >
              Skapa en ny version
            </button>
          </div>
        </div>
      </section>
    );
  }

  // ── Build error ────────────────────────────────────────────────────────
  if (isBuildError) {
    return (
      <section className="space-y-4">
        <div className="card-base border-red-200 p-6 dark:border-red-500/30">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50 dark:bg-red-950/30">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                className="text-red-500"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <path
                  d="M15 9L9 15M9 9l6 6"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-[15px] font-semibold text-red-700 dark:text-red-300">
                Kunde inte bygga trailern
              </p>
              <p className="mt-1 text-[13px] text-red-600 dark:text-red-400">
                {state.build.errorMessage}
              </p>
              <button
                type="button"
                onClick={() => void buildTrailer()}
                className="btn-primary mt-3"
              >
                Försök igen
              </button>
            </div>
          </div>
        </div>
        <div className="flex justify-start">
          <button
            type="button"
            onClick={goBack}
            disabled={!canGoBack}
            className="rounded-xl border border-slate-200 px-4 py-2 text-[13px] font-semibold text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/20 dark:text-white/80 dark:hover:border-white/30"
          >
            Tillbaka
          </button>
        </div>
      </section>
    );
  }

  // ── Scenes ready — show preview + build controls ───────────────────────
  if (isGenReady) {
    return (
      <section className="space-y-4">
        {/* Scene preview */}
        <div className="card-base p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/30">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  className="text-emerald-500"
                >
                  <path
                    d="M22 11.08V12a10 10 0 11-5.93-9.14"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                  <path
                    d="M22 4L12 14.01l-3-3"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div>
                <h2 className="text-[16px] font-semibold text-slate-900 dark:text-white">
                  Scener genererade
                </h2>
                <p className="mt-0.5 text-[13px] text-slate-500 dark:text-white/50">
                  Granska scenerna nedan. Nöjd? Skapa trailern.
                </p>
              </div>
            </div>
            {totalDuration > 0 && (
              <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-[12px] font-medium tabular-nums text-slate-600 dark:bg-white/5 dark:text-white/60">
                {totalDuration}s
              </span>
            )}
          </div>

          {/* Scenes */}
          <div className="mt-5 space-y-3">
            {state.generate.scenes.map((scene, index) => (
              <div key={index} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white dark:bg-white dark:text-slate-900">
                    {index + 1}
                  </div>
                  {index < state.generate.scenes.length - 1 && (
                    <div className="mt-1 w-px flex-1 bg-slate-200 dark:bg-white/10" />
                  )}
                </div>
                <div className="mb-1 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[12px] font-semibold text-slate-900 dark:text-white">
                      Scen {index + 1}
                    </p>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium tabular-nums text-slate-500 dark:border-white/15 dark:bg-white/5 dark:text-white/50">
                      {scene.duration}s
                    </span>
                  </div>
                  <p className="mt-2 text-[13px] leading-relaxed text-slate-600 dark:text-white/70">
                    {scene.visual_prompt}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {state.generate.titleCard && (
            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.03]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-white/40">
                Titelkort
              </p>
              <p className="mt-1.5 text-[14px] font-medium text-slate-900 dark:text-white">
                {state.generate.titleCard}
              </p>
            </div>
          )}

          {state.generate.caption && (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.03]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-white/40">
                Bildtext
              </p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-slate-600 dark:text-white/70">
                {state.generate.caption}
              </p>
            </div>
          )}

          {state.generate.hashtags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {state.generate.hashtags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] text-slate-500 dark:border-white/15 dark:bg-white/5 dark:text-white/50"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Regenerate */}
          {canRegenerate && (
            <div className="mt-5 flex items-center gap-3 border-t border-slate-100 pt-4 dark:border-white/5">
              <button
                type="button"
                onClick={() => void regenerateScenes()}
                className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-[13px] font-semibold text-slate-600 transition hover:border-slate-300 dark:border-white/20 dark:text-white/70 dark:hover:border-white/30"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  className="text-slate-400 dark:text-white/40"
                >
                  <path
                    d="M1 4v6h6M23 20v-6h-6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Generera om
              </button>
              <span className="text-[12px] tabular-nums text-slate-400 dark:text-white/30">
                {state.generate.regenerateCount}/{MAX_REGENERATE_ATTEMPTS}
              </span>
            </div>
          )}
        </div>

        {/* Build controls */}
        {isConfirming ? (
          <div className="card-base p-6">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 dark:border-white/10 dark:bg-white/[0.03]">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-medium text-slate-600 dark:text-white/60">
                  Kvot denna månad
                </span>
                <span
                  className={`rounded-full px-3 py-1 text-[12px] font-semibold ${
                    state.build.isProUser
                      ? "bg-[#907AFF]/10 text-[#907AFF] dark:bg-[#907AFF]/20"
                      : "bg-slate-200 text-slate-600 dark:bg-white/10 dark:text-white/60"
                  }`}
                >
                  {state.build.isProUser ? "Pro" : "Free"}
                </span>
              </div>
              <p className="mt-2 text-[24px] font-semibold tabular-nums text-slate-900 dark:text-white">
                {state.build.quotaUsed}
                <span className="text-[14px] font-normal text-slate-400 dark:text-white/30">
                  {" "}
                  / {state.build.quotaLimit}
                </span>
              </p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
                <div
                  className={`h-full rounded-full transition-all ${
                    quotaExhausted ? "bg-red-400" : "bg-[#907AFF]"
                  }`}
                  style={{
                    width: `${Math.min(100, (state.build.quotaUsed / state.build.quotaLimit) * 100)}%`,
                  }}
                />
              </div>
            </div>

            {state.build.isProUser ? (
              <button
                type="button"
                onClick={() => void buildTrailer()}
                disabled={quotaExhausted || isBuilding}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#907AFF] to-[#6C5CE7] px-6 py-3 text-[15px] font-medium text-white shadow-sm transition hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <path
                    d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {quotaExhausted ? "Kvoten uppnådd" : "Skapa trailer"}
              </button>
            ) : (
              <div className="mt-4 space-y-3">
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-950/20">
                  <p className="text-[13px] font-medium text-amber-800 dark:text-amber-200">
                    Trailerbygge kräver Pro-plan
                  </p>
                  <p className="mt-1 text-[12px] text-amber-600 dark:text-amber-400">
                    Uppgradera för att bygga och ladda ner boktrailers med AI.
                  </p>
                </div>
                <a
                  href="/author/billing"
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#907AFF] to-[#6C5CE7] px-6 py-3 text-[15px] font-medium text-white shadow-sm transition hover:shadow-md active:scale-[0.98]"
                >
                  Uppgradera till Pro
                </a>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={goBack}
              disabled={!canGoBack}
              className="rounded-xl border border-slate-200 px-4 py-2 text-[13px] font-semibold text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/20 dark:text-white/80 dark:hover:border-white/30"
            >
              Tillbaka
            </button>
            <button
              type="button"
              onClick={handleStartBuild}
              className="flex items-center gap-2 rounded-full bg-gradient-to-r from-[#907AFF] to-[#6C5CE7] px-6 py-3 text-[15px] font-medium text-white shadow-sm transition hover:shadow-md active:scale-[0.98]"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
              >
                <path
                  d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Skapa trailer
            </button>
          </div>
        )}
      </section>
    );
  }

  // ── Fallback ───────────────────────────────────────────────────────────
  return (
    <section className="card-base flex items-center justify-center p-8">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-slate-600 dark:border-white/10 dark:border-t-white/60" />
    </section>
  );
}
