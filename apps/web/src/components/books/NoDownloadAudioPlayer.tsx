"use client";

import { useCallback, useEffect, useRef, useState, type ComponentPropsWithoutRef } from "react";

/**
 * Media handlers callers may attach. Kept to the set `useListenTracking`
 * produces (WP-03) so its return value can be spread straight through, rather
 * than this component re-declaring an <audio> element the instrumentation
 * cannot reach.
 */
type ForwardedMediaHandlers = Pick<
  ComponentPropsWithoutRef<"audio">,
  "onLoadedMetadata" | "onPlay" | "onPause" | "onTimeUpdate" | "onSeeked" | "onEnded" | "onEmptied"
>;

type NoDownloadAudioPlayerProps = {
  src: string;
  className?: string;
} & ForwardedMediaHandlers;

export default function NoDownloadAudioPlayer({
  src,
  className = "w-full",
  ...mediaHandlers
}: NoDownloadAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [speed, setSpeed] = useState(1);
  const [sleepMinutes, setSleepMinutes] = useState(0);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [timerEnded, setTimerEnded] = useState(false);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  const stopIfDue = useCallback(() => {
    if (deadline === null || Date.now() < deadline) return;
    audioRef.current?.pause();
    setDeadline(null);
    setSleepMinutes(0);
    setTimerEnded(true);
  }, [deadline]);

  useEffect(() => {
    if (deadline === null) return;
    // Check wall-clock time on wake as well: background tabs can throttle timers.
    const timer = setInterval(stopIfDue, 1000);
    document.addEventListener("visibilitychange", stopIfDue);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", stopIfDue);
    };
  }, [deadline, stopIfDue]);

  return (
    <div className="space-y-3">
      <audio
        ref={audioRef}
        controls
        preload="none"
        controlsList="nodownload noplaybackrate"
        onContextMenu={(event) => event.preventDefault()}
        className={className}
        src={src}
        {...mediaHandlers}
        onLoadedMetadata={(event) => {
          event.currentTarget.playbackRate = speed;
          setFailedSrc(null);
          mediaHandlers.onLoadedMetadata?.(event);
        }}
        onPlay={(event) => {
          stopIfDue();
          mediaHandlers.onPlay?.(event);
        }}
        onTimeUpdate={(event) => {
          stopIfDue();
          mediaHandlers.onTimeUpdate?.(event);
        }}
        onError={() => setFailedSrc(src)}
      >
        Your browser does not support audio playback.
      </audio>
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <label className="flex items-center gap-2">
          Playback speed
          <select value={speed} onChange={(event) => {
            const value = Number(event.target.value);
            setSpeed(value);
            if (audioRef.current) audioRef.current.playbackRate = value;
          }} className="rounded-lg border border-border bg-background px-2 py-1.5 text-foreground">
            {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((value) => <option key={value} value={value}>{value}×</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2">
          Sleep timer
          <select value={sleepMinutes} onChange={(event) => {
            const minutes = Number(event.target.value);
            setSleepMinutes(minutes);
            setDeadline(minutes ? Date.now() + minutes * 60_000 : null);
            setTimerEnded(false);
          }} className="rounded-lg border border-border bg-background px-2 py-1.5 text-foreground">
            <option value={0}>Off</option>
            {[5, 15, 30, 60].map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}
          </select>
        </label>
      </div>
      <p role="status" className="text-xs text-muted-foreground">
        {deadline !== null ? `Playback will pause ${sleepMinutes} minutes after you set the timer. Keep this page open.` : timerEnded ? "Sleep timer ended. Press play to continue." : ""}
      </p>
      {failedSrc === src && <p role="alert" className="text-xs text-destructive">Could not play this audio. Reload the page and try again.</p>}
    </div>
  );
}
