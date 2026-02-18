"use client";

type NoDownloadAudioPlayerProps = {
  src: string;
  className?: string;
};

export default function NoDownloadAudioPlayer({
  src,
  className = "w-full",
}: NoDownloadAudioPlayerProps) {
  return (
    <audio
      controls
      preload="none"
      controlsList="nodownload noplaybackrate"
      onContextMenu={(event) => event.preventDefault()}
      className={className}
      src={src}
    >
      Your browser does not support audio playback.
    </audio>
  );
}
