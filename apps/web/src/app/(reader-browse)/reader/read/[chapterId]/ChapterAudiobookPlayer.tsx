"use client";

import { useEffect, useMemo, useState } from "react";
import { getAudiobookEnabled } from "@/lib/flags";

type Props = {
  bookId: string;
  chapterId: string;
  audiobookStatus?: string | null;
  isAuthorView?: boolean;
};

type ChapterPlaybackResponse = {
  audioUrl?: unknown;
};

type ChapterPlaybackErrorResponse = {
  error?: unknown;
};

const LOADING_INDICATOR_DELAY_MS = 150;
// Keep in sync with the audiobook worker's terminal-success vocabulary.
// The worker and the author library also emit "ready" — without it the
// reader player silently refuses to fetch newly-rendered audiobooks.
const READY_AUDIOBOOK_STATUSES = new Set([
  "published",
  "generated",
  "completed",
  "ready",
]);

export default function ChapterAudiobookPlayer({
  bookId,
  chapterId,
  audiobookStatus,
  isAuthorView,
}: Props) {
  const audiobookFeatureEnabled = getAudiobookEnabled();
  const resolvedIsAuthorView = useMemo(() => {
    if (typeof isAuthorView === "boolean") return isAuthorView;
    if (typeof window === "undefined") return false;
    return window.location.pathname.startsWith("/author/");
  }, [isAuthorView]);
  const normalizedAudiobookStatus =
    typeof audiobookStatus === "string" ? audiobookStatus.trim().toLowerCase() : null;
  const shouldAttemptLoad =
    resolvedIsAuthorView ||
    normalizedAudiobookStatus == null ||
    READY_AUDIOBOOK_STATUSES.has(normalizedAudiobookStatus);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(audiobookFeatureEnabled && shouldAttemptLoad);
  const [showLoading, setShowLoading] = useState(false);
  const [hidePlayer, setHidePlayer] = useState(false);
  const [notPublishedNotice, setNotPublishedNotice] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!audiobookFeatureEnabled || !shouldAttemptLoad) {
      setAudioUrl(null);
      setLoading(false);
      setShowLoading(false);
      setHidePlayer(false);
      setNotPublishedNotice(false);
      setIsPlaying(false);
      setError(null);
      return;
    }

    let cancelled = false;
    let loadingTimer: ReturnType<typeof setTimeout> | null = null;

    const loadChapterAudio = async () => {
      setLoading(true);
      setShowLoading(false);
      setError(null);
      setHidePlayer(false);
      setNotPublishedNotice(false);
      setAudioUrl(null);
      setIsPlaying(false);

      loadingTimer = setTimeout(() => {
        if (!cancelled) {
          setShowLoading(true);
        }
      }, LOADING_INDICATOR_DELAY_MS);

      try {
        const params = new URLSearchParams({ chapterId });
        const response = await fetch(`/api/books/${bookId}/audiobook/play?${params.toString()}`, {
          cache: "no-store",
        });

        if (!response.ok) {
          const errorPayload = (await response.json().catch(() => null)) as ChapterPlaybackErrorResponse | null;
          const errorCode = typeof errorPayload?.error === "string" ? errorPayload.error : null;
          if (errorCode === "AUDIOBOOK_FEATURE_DISABLED") {
            if (!cancelled) {
              setAudioUrl(null);
              setError(null);
            }
            return;
          }
          if (errorCode === "CHAPTER_NOT_PUBLISHED") {
            if (!cancelled) {
              setAudioUrl(null);
              if (resolvedIsAuthorView) {
                setNotPublishedNotice(true);
              } else {
                setHidePlayer(true);
              }
            }
            return;
          }
          if (errorCode === "AUDIO_SIGN_FAILED") {
            if (!cancelled) {
              setError("Could not load audio, try again");
            }
            return;
          }
          throw new Error(`Chapter audiobook request failed (${response.status})`);
        }

        const payload = (await response.json()) as ChapterPlaybackResponse;
        const nextAudioUrl =
          typeof payload.audioUrl === "string" && payload.audioUrl.trim().length > 0
            ? payload.audioUrl.trim()
            : null;

        if (!cancelled) {
          setAudioUrl(nextAudioUrl);
        }
      } catch {
        if (!cancelled) {
          setError("Could not load audio, try again");
        }
      } finally {
        if (loadingTimer) {
          clearTimeout(loadingTimer);
        }
        if (!cancelled) {
          setShowLoading(false);
          setLoading(false);
        }
      }
    };

    void loadChapterAudio();

    return () => {
      cancelled = true;
      if (loadingTimer) {
        clearTimeout(loadingTimer);
      }
    };
  }, [audiobookFeatureEnabled, bookId, chapterId, resolvedIsAuthorView, shouldAttemptLoad]);

  if (!audiobookFeatureEnabled || !shouldAttemptLoad) {
    return null;
  }

  if (loading) {
    return (
      <p
        className={`mt-7 text-xs text-slate-600 dark:text-white/65 ${
          showLoading ? "" : "pointer-events-none select-none opacity-0"
        }`}
        aria-hidden={showLoading ? undefined : true}
      >
        Loading chapter audio...
      </p>
    );
  }

  if (hidePlayer) {
    return null;
  }

  if (notPublishedNotice) {
    return (
      <p className="mt-7 text-xs text-slate-600 dark:text-white/65">
        Not published yet
      </p>
    );
  }

  if (error) {
    return (
      <p className="mt-7 text-xs text-amber-700 dark:text-amber-300" role="alert">
        {error}
      </p>
    );
  }

  if (!audioUrl) {
    return null;
  }

  return (
    <div className="mt-7 rounded-[26px] border border-[#8eb7e8]/35 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(239,248,255,0.84))] p-5 shadow-[0_14px_36px_rgba(59,130,246,0.08)] dark:border-emerald-400/20 dark:bg-emerald-900/10 dark:shadow-none">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-slate-700 dark:text-emerald-200">
          Audiobook
        </p>
        {isPlaying ? (
          <p className="inline-flex items-center gap-1.5 text-[11px] text-emerald-700 dark:text-emerald-200/90">
            <span className="relative inline-flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/50" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Playing
          </p>
        ) : (
          <p className="text-[11px] text-slate-600 dark:text-emerald-200/80">
            Chapter playback
          </p>
        )}
      </div>
      <audio
        controls
        preload="none"
        className="w-full"
        src={audioUrl}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onEmptied={() => setIsPlaying(false)}
      >
        Your browser does not support audio playback.
      </audio>
    </div>
  );
}
