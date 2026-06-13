"use client";

import { useState, useEffect, useRef } from "react";
import type { TrailerGenre, TrailerTone } from "@/lib/ai/trailer-generation/schemas";
import { getMarketingEnabled } from "@/lib/flags";

export type TrailerPanelProps = {
  bookId: string;
  bookTitle: string;
  bookDescription: string | null;
  coverImage: string | null;
  isPublished: boolean;
  trailerStatus: string | null;
  trailerUrl: string | null;
  isProLocked: boolean;
  billingLoading: boolean;
};

const TRAILER_GENRES: { value: TrailerGenre; label: string }[] = [
  { value: "romance", label: "Romance" },
  { value: "fantasy", label: "Fantasy" },
  { value: "thriller", label: "Thriller" },
  { value: "ya", label: "Young Adult" },
  { value: "literary", label: "Literary Fiction" },
  { value: "biography", label: "Biography" },
];

const TRAILER_TONES: { value: TrailerTone; label: string }[] = [
  { value: "dark", label: "Dark" },
  { value: "dreamy", label: "Dreamy" },
  { value: "intense", label: "Intense" },
  { value: "whimsical", label: "Whimsical" },
  { value: "melancholic", label: "Melancholic" },
  { value: "suspenseful", label: "Suspenseful" },
  { value: "passionate", label: "Passionate" },
  { value: "epic", label: "Epic" },
];

export default function TrailerPanel({
  bookId,
  bookTitle,
  bookDescription,
  coverImage,
  isPublished: _isPublished, // eslint-disable-line @typescript-eslint/no-unused-vars
  trailerStatus: initialStatus,
  trailerUrl: initialUrl,
  isProLocked,
  billingLoading,
}: TrailerPanelProps) {
  const marketingEnabled = getMarketingEnabled();
  const [status, setStatus] = useState<string | null>(initialStatus);
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [genre, setGenre] = useState<TrailerGenre>("literary");
  const [tone, setTone] = useState<TrailerTone>("dreamy");
  const [keywords, setKeywords] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  // A completed trailer one-off purchase, picked up from the checkout return
  // URL, unlocks a single build for non-PRO authors.
  const [paidSessionId, setPaidSessionId] = useState<string | null>(null);
  const [isBuying, setIsBuying] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // PRO authors build under their plan; a valid paid one-off unlocks one build.
  const effectiveUnlock = !isProLocked || Boolean(paidSessionId);

  // Poll for status while generating
  useEffect(() => {
    if (status !== "generating") {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/books/${bookId}/trailer/status`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === "ready" && data.url) {
          setStatus("ready");
          setUrl(data.url);
        } else if (data.status === "failed") {
          setStatus("failed");
          setError("Trailer generation failed. Try again.");
        }
      } catch {
        // Ignore polling errors
      }
    }, 10_000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [status, bookId]);

  // Pick up a completed trailer one-off purchase from the checkout return URL
  // (?trailer_checkout=success&session_id=...). Read client-side after mount so
  // it stays hydration-safe.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("trailer_checkout") === "success") {
      const sid = sp.get("session_id");
      if (sid) setPaidSessionId(sid);
    }
  }, []);

  const handleBuy = async () => {
    if (isBuying) return;
    setIsBuying(true);
    setError(null);
    try {
      const res = await fetch(`/api/books/${bookId}/trailer/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.url) {
        throw new Error(data?.message ?? `Checkout failed (${res.status})`);
      }
      window.location.href = data.url as string;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start checkout.");
      setIsBuying(false);
    }
  };

  const handleGenerate = async () => {
    if (!effectiveUnlock || !coverImage) return;
    setIsGenerating(true);
    setError(null);
    setStatus("generating");

    try {
      const res = await fetch(`/api/books/${bookId}/trailer/build`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: bookTitle || "Untitled",
          genre,
          description: bookDescription || bookTitle || "A new book",
          keywords: keywords
            .split(",")
            .map((k) => k.trim())
            .filter(Boolean),
          tone,
          audio: true,
          // Forward the paid one-off session so a non-PRO author's build is
          // authorized + redeemed server-side.
          ...(paidSessionId ? { stripeSessionId: paidSessionId } : {}),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message ?? `Request failed (${res.status})`);
      }

      const data = await res.json();
      if (data.url) {
        setStatus("ready");
        setUrl(data.url);
      }
      // Otherwise status stays "generating" and polling handles it
    } catch (err) {
      setStatus("failed");
      setError(err instanceof Error ? err.message : "Trailer generation failed.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRegenerate = () => {
    setStatus(null);
    setUrl(null);
  };

  if (!marketingEnabled) {
    return (
      <div className="mx-20 mt-10 max-w-6xl">
        <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-5 text-[13px] text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/65">
          <p className="text-[14px] font-semibold text-slate-800 dark:text-white">
            Trailers are currently disabled.
          </p>
          <p className="mt-1">
            Marketing tools are turned off for this environment. Ask an admin to
            enable the marketing feature flag to generate book trailers.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-20 mt-10 max-w-6xl">
      {/* ── Header ── */}
      <div className="mb-8">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#907AFF]/10 dark:bg-[#907AFF]/15">
            <svg
              className="h-4 w-4 text-[#907AFF]"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Book Trailer</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-white/45">
              Create an AI-generated video trailer for your book
            </p>
          </div>
        </div>
      </div>

      {/* ── Pro Lock Overlay (with one-off buy option) ── */}
      {isProLocked && !paidSessionId && (
        <div className="absolute inset-0 z-10 rounded-2xl bg-black/40 backdrop-blur-sm flex items-center justify-center">
          <div className="max-w-xs rounded-xl bg-white px-5 py-4 text-center shadow-lg dark:bg-slate-900">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">PRO feature</p>
            <p className="mt-1 text-xs text-slate-600 dark:text-white/60">
              Included with PRO — or buy a single trailer.
            </p>
            <button
              type="button"
              onClick={() => void handleBuy()}
              disabled={isBuying || billingLoading}
              className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center rounded-full bg-[#907AFF] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#8069EE] focus:outline-none focus:ring-2 focus:ring-[#907AFF]/40 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isBuying ? "Starting checkout…" : "Buy trailer · 99 kr"}
            </button>
          </div>
        </div>
      )}

      {/* ── Video Preview (Ready State) ── */}
      {status === "ready" && url && (
        <div className="rounded-2xl border border-black/[0.05] bg-white/60 p-6 backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02]">
          <video
            src={url}
            controls
            playsInline
            preload="metadata"
            poster={coverImage ?? undefined}
            className="w-full rounded-xl mb-4"
            controlsList="nodownload"
            onContextMenu={(e) => e.preventDefault()}
          />
          <button
            type="button"
            onClick={handleRegenerate}
            className="w-full rounded-xl border border-black/[0.08] bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white/70 dark:hover:bg-white/[0.06]"
          >
            Regenerate Trailer
          </button>
        </div>
      )}

      {/* ── Generation Status (Generating State) ── */}
      {status === "generating" && (
        <div className="rounded-2xl border border-black/[0.05] bg-white/60 p-8 backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02] flex flex-col items-center gap-4 text-center">
          <div className="rounded-xl bg-gradient-to-br from-[#907AFF] to-[#7c6ae6] p-3 text-white shadow-sm">
            <svg
              className="h-5 w-5 animate-pulse"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z"
              />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Generating your trailer...</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-white/50">
              This usually takes a few minutes. You can leave this page — we&apos;ll finish in the background.
            </p>
          </div>
          <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.06]">
            <div className="h-full animate-pulse rounded-full bg-gradient-to-r from-[#907AFF] to-[#E29ED5]" />
          </div>
        </div>
      )}

      {/* ── Generation Form (Default / Failed State) ── */}
      {!status || status === "failed" ? (
        <div className="rounded-2xl border border-black/[0.05] bg-white/60 p-6 backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02] space-y-4">
          {error && (
            <div className="rounded-lg border border-red-200/60 bg-red-50/60 px-3 py-2 text-xs text-red-700 dark:border-red-900/30 dark:bg-red-950/10 dark:text-red-400">
              {error}
            </div>
          )}

          {!coverImage && (
            <div className="rounded-lg border border-amber-200/60 bg-amber-50/60 px-3 py-2 text-xs text-amber-700 dark:border-amber-900/30 dark:bg-amber-950/10 dark:text-amber-400">
              Upload a cover image first to generate a trailer.
            </div>
          )}

          {/* Genre & Tone Selectors */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40">
                Genre
              </label>
              <select
                value={genre}
                onChange={(e) => setGenre(e.target.value as TrailerGenre)}
                disabled={!effectiveUnlock}
                className="w-full rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-xs text-slate-700 transition dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white/70 disabled:opacity-50"
              >
                {TRAILER_GENRES.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40">
                Tone
              </label>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value as TrailerTone)}
                disabled={!effectiveUnlock}
                className="w-full rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-xs text-slate-700 transition dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white/70 disabled:opacity-50"
              >
                {TRAILER_TONES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Keywords Input */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40">
              Keywords (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g., mystery, magic, love"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              disabled={!effectiveUnlock}
              className="w-full rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-xs text-slate-700 placeholder-slate-400 transition dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white/70 dark:placeholder-white/20 disabled:opacity-50"
            />
          </div>

          {/* Generate Button */}
          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={isGenerating || !effectiveUnlock || !coverImage || billingLoading}
            className="w-full rounded-lg bg-gradient-to-r from-[#907AFF] to-[#7c6ae6] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? "Generating..." : paidSessionId ? "Generate Trailer (paid)" : "Generate Trailer"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
