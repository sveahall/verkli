"use client";

import { useState, useRef, useCallback } from "react";

type VideoPlayerProps = {
  src: string;
  poster?: string | null;
  className?: string;
};

export default function VideoPlayer({
  src,
  poster,
  className = "",
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showOverlay, setShowOverlay] = useState(true);

  const handlePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.play();
    setIsPlaying(true);
    setShowOverlay(false);
  }, []);

  const handlePause = useCallback(() => {
    setIsPlaying(false);
    setShowOverlay(true);
  }, []);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    setShowOverlay(true);
  }, []);

  return (
    <div className={`relative overflow-hidden rounded-xl ${className}`}>
      <video
        ref={videoRef}
        src={src}
        poster={poster ?? undefined}
        controls={isPlaying}
        playsInline
        preload="metadata"
        onPause={handlePause}
        onEnded={handleEnded}
        onPlay={() => {
          setIsPlaying(true);
          setShowOverlay(false);
        }}
        className="w-full rounded-xl"
        controlsList="nodownload"
        onContextMenu={(e) => e.preventDefault()}
      >
        Your browser does not support video playback.
      </video>

      {showOverlay && (
        <button
          type="button"
          onClick={handlePlay}
          className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors hover:bg-black/30"
          aria-label="Play trailer"
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#907AFF] text-white shadow-[0_4px_20px_rgba(144,122,255,0.4)] transition-transform hover:scale-110">
            <svg
              className="ml-1 h-7 w-7"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M8 5.14v14l11-7-11-7z" />
            </svg>
          </span>
        </button>
      )}
    </div>
  );
}
