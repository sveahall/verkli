"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LANGUAGE_OPTIONS, normalizeLanguage } from "@/lib/languages";
import { formatPlayerTime } from "../BookEditorView.helpers";

// ── AudiobookPreviewPlayer ────────────────────────────────────────────────────

interface AudiobookPreviewPlayerProps {
  audioUrl: string | null;
  bookId: string;
}

export function AudiobookPreviewPlayer({ audioUrl, bookId }: AudiobookPreviewPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1.0);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const effectiveAudioUrl = previewUrl ?? audioUrl;

  const handleGeneratePreview = async () => {
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const res = await fetch(`/api/books/${bookId}/audiobook/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setPreviewError(body?.detail ?? "Preview unavailable");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
      // Auto-play after loading
      setTimeout(() => {
        if (audioRef.current) {
          audioRef.current.src = url;
          void audioRef.current.play().then(() => setPlaying(true));
        }
      }, 100);
    } catch {
      setPreviewError("Could not generate preview");
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 dark:border-white/[0.06] dark:bg-white/[0.03]">
      {effectiveAudioUrl && (
        <audio
          ref={audioRef}
          src={effectiveAudioUrl}
          onTimeUpdate={() => {
            if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
          }}
          onLoadedMetadata={() => {
            if (audioRef.current) setDuration(audioRef.current.duration);
          }}
          onEnded={() => setPlaying(false)}
        />
      )}

      {/* Progress bar */}
      <div className="mb-5">
        <div
          className="relative h-1 cursor-pointer rounded-full bg-slate-200/80 dark:bg-white/10"
          onClick={(e) => {
            if (!audioRef.current || !duration) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            audioRef.current.currentTime = ratio * duration;
          }}
        >
          <div
            className="h-full rounded-full bg-[#907AFF]/40 transition-all"
            style={{ width: duration > 0 ? `${(currentTime / duration) * 100}%` : "0%" }}
          />
          <div
            className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-[#907AFF] shadow-sm transition-all"
            style={{ left: duration > 0 ? `calc(${(currentTime / duration) * 100}% - 6px)` : "0" }}
          />
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between">
        <span className="min-w-[90px] text-[15px] tabular-nums text-slate-500 dark:text-white/50">
          {formatPlayerTime(currentTime)} / {formatPlayerTime(duration)}
        </span>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => {
              if (audioRef.current) {
                audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 30);
              }
            }}
            className="text-slate-400 transition hover:text-slate-600 dark:text-white/40 dark:hover:text-white/70"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm12 0v12l-8.5-6z" /></svg>
          </button>
          <button
            type="button"
            onClick={() => {
              if (!audioRef.current) return;
              if (playing) {
                audioRef.current.pause();
                setPlaying(false);
              } else {
                void audioRef.current.play();
                setPlaying(true);
              }
            }}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-[#907AFF] text-white transition hover:bg-[#7c6ae6]"
          >
            {playing ? (
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
            ) : (
              <svg className="ml-0.5 h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              if (audioRef.current) {
                audioRef.current.currentTime = Math.min(
                  audioRef.current.duration || 0,
                  audioRef.current.currentTime + 30
                );
              }
            }}
            className="text-slate-400 transition hover:text-slate-600 dark:text-white/40 dark:hover:text-white/70"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" /></svg>
          </button>
        </div>
        <button
          type="button"
          onClick={() => {
            const speeds = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
            const idx = speeds.indexOf(speed);
            const next = speeds[(idx + 1) % speeds.length];
            setSpeed(next);
            if (audioRef.current) audioRef.current.playbackRate = next;
          }}
          className="min-w-[40px] text-right text-[15px] font-medium tabular-nums text-slate-600 transition hover:text-slate-800 dark:text-white/60 dark:hover:text-white/80"
        >
          {speed === 1 ? "1.0" : speed}x
        </button>
      </div>

      {/* Preview voice button */}
      {!effectiveAudioUrl && (
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={handleGeneratePreview}
            disabled={previewLoading}
            className="inline-flex items-center gap-2 rounded-xl border border-[#907AFF]/20 bg-[#907AFF]/5 px-4 py-2.5 text-[13px] font-semibold text-[#907AFF] transition hover:bg-[#907AFF]/10 active:scale-[0.97] disabled:opacity-50"
          >
            {previewLoading ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#907AFF]/30 border-t-[#907AFF]" />
                Generating preview...
              </>
            ) : (
              <>
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                Preview voice
              </>
            )}
          </button>
          <p className="mt-2 text-[11px] text-slate-400 dark:text-white/30">
            Generates a short sample from your first chapter
          </p>
          {previewError && (
            <p className="mt-2 text-[12px] text-red-500">{previewError}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── AudiobookCheckoutModal ────────────────────────────────────────────────────

interface AudiobookCheckoutModalProps {
  open: boolean;
  onClose: () => void;
  audiobookError: string | null;
  audiobookCheckoutLoading: boolean;
  onCheckout: () => void;
}

export function AudiobookCheckoutModal({
  open,
  onClose,
  audiobookError,
  audiobookCheckoutLoading,
  onCheckout,
}: AudiobookCheckoutModalProps) {
  const router = useRouter();

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative mx-4 w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl dark:bg-slate-900">
        <button type="button" onClick={onClose} className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:text-white/40 dark:hover:text-white/70" aria-label="Close">
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
          <label
            className="flex cursor-pointer items-start gap-3 rounded-xl border-2 border-slate-200 px-4 py-4 transition hover:border-slate-300 dark:border-white/10 dark:hover:border-white/20"
            onClick={() => { onClose(); router.push("/author/billing"); }}
          >
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
          onClick={() => { onClose(); onCheckout(); }}
          disabled={audiobookCheckoutLoading}
          className="mt-6 block w-full rounded-full bg-[#907AFF] px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#7c6ae6] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {audiobookCheckoutLoading ? "Redirecting..." : "Generate full audiobook"}
        </button>
      </div>
    </div>
  );
}

// ── AudiobookLanguageList ─────────────────────────────────────────────────────

interface AudiobookLanguageListProps {
  bookLanguage: string | null;
  bookOriginalLanguage: string | null;
  audiobookSelectedLanguages: string[];
  setAudiobookSelectedLanguages: React.Dispatch<React.SetStateAction<string[]>>;
}

export function AudiobookLanguageList({
  bookLanguage,
  bookOriginalLanguage,
  audiobookSelectedLanguages,
  setAudiobookSelectedLanguages,
}: AudiobookLanguageListProps) {
  const bookLang = normalizeLanguage(bookLanguage ?? bookOriginalLanguage);
  const sorted = [...LANGUAGE_OPTIONS].sort((a, b) =>
    a.value === bookLang ? -1 : b.value === bookLang ? 1 : 0
  );

  return (
    <div className="mt-4 divide-y divide-slate-100 dark:divide-white/[0.06]">
      {sorted.map((lang) => {
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
      })}
    </div>
  );
}
