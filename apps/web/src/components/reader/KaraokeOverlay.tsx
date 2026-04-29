"use client";

// Karaoke audio-text sync overlay (Phase 1.1).
//
// Renders the chapter text as token spans and highlights the active word
// based on the audio element's `currentTime`. Behavior:
//   - O(log n) bisect on the words array each `timeupdate` event so 5000-word
//     chapters remain smooth at 60fps.
//   - On the active word, scrolls into view if not already on screen.
//   - Falls back to the un-highlighted text when timestamps are missing.
//
// The component is purely presentational: it does NOT control the audio
// element. Instead it expects a ref to an existing <audio>; the host page
// renders both the audio player and this overlay together.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type KaraokeWord = {
  word: string;
  start: number;
  end: number;
};

type Props = {
  /** Words with start/end seconds. Pass `null` to render the chapter text without sync. */
  words: KaraokeWord[] | null;
  /** Plain-text fallback used when timestamps are missing or empty. */
  fallbackText: string;
  /** A ref to the <audio> element whose currentTime drives highlighting. */
  audioRef: React.RefObject<HTMLAudioElement | null>;
  /** Visual style for the active word. Defaults to project primary highlight. */
  activeClassName?: string;
  /** Whether to autoscroll the active word into view. Default true. */
  autoscroll?: boolean;
};

const DEFAULT_ACTIVE_CLASS =
  "bg-primary/15 text-primary px-0.5 rounded-sm transition-colors duration-100";

/** Bisect: find the largest index i such that words[i].start <= t. -1 if none. */
function bisectActive(words: KaraokeWord[], t: number): number {
  let lo = 0;
  let hi = words.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const w = words[mid]!;
    if (w.start <= t) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (best >= 0) {
    const w = words[best]!;
    if (t < w.end + 0.05) return best; // small tolerance for hangover
  }
  return best;
}

export default function KaraokeOverlay({
  words,
  fallbackText,
  audioRef,
  activeClassName,
  autoscroll = true,
}: Props) {
  const [activeIndex, setActiveIndex] = useState(-1);
  const wordRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const timestamps = useMemo(() => words ?? null, [words]);

  const handleTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !timestamps || timestamps.length === 0) return;
    const next = bisectActive(timestamps, audio.currentTime);
    setActiveIndex((prev) => (prev === next ? prev : next));
  }, [audioRef, timestamps]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("seeking", handleTimeUpdate);
    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("seeking", handleTimeUpdate);
    };
  }, [audioRef, handleTimeUpdate]);

  useEffect(() => {
    if (!autoscroll || activeIndex < 0) return;
    const el = wordRefs.current[activeIndex];
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const inView =
      rect.top >= 0 &&
      rect.bottom <= (window.innerHeight || document.documentElement.clientHeight);
    if (!inView) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeIndex, autoscroll]);

  if (!timestamps || timestamps.length === 0) {
    return (
      <div className="whitespace-pre-wrap leading-relaxed" data-testid="karaoke-fallback">
        {fallbackText}
      </div>
    );
  }

  return (
    <div className="leading-relaxed" data-testid="karaoke-overlay">
      {timestamps.map((w, i) => {
        const isActive = i === activeIndex;
        return (
          <span key={i}>
            <span
              ref={(node) => {
                wordRefs.current[i] = node;
              }}
              className={isActive ? (activeClassName ?? DEFAULT_ACTIVE_CLASS) : undefined}
              data-testid={isActive ? "karaoke-active-word" : undefined}
            >
              {w.word}
            </span>{" "}
          </span>
        );
      })}
    </div>
  );
}
