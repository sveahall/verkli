"use client";

import type { ComponentPropsWithoutRef } from "react";

/**
 * Media handlers callers may attach. Kept to the set `useListenTracking`
 * produces (WP-03) so its return value can be spread straight through, rather
 * than this component re-declaring an <audio> element the instrumentation
 * cannot reach.
 */
type ForwardedMediaHandlers = Pick<
  ComponentPropsWithoutRef<"audio">,
  "onLoadedMetadata" | "onPlay" | "onPause" | "onTimeUpdate" | "onSeeked" | "onEnded"
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
  return (
    <audio
      controls
      preload="none"
      controlsList="nodownload noplaybackrate"
      onContextMenu={(event) => event.preventDefault()}
      className={className}
      src={src}
      {...mediaHandlers}
    >
      Your browser does not support audio playback.
    </audio>
  );
}
