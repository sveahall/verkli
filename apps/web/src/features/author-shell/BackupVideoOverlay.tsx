"use client";

import { useEffect, useState } from "react";
import { BACKUP_VIDEO_EVENT } from "./useDemoHotkeys";

/**
 * Cmd+Shift+V failover. Listens for BACKUP_VIDEO_EVENT and renders a
 * fullscreen overlay playing /demo-assets/backup-video.mp4. Click anywhere
 * (or Esc) to dismiss.
 *
 * The video file is intentionally optional — drop the mp4 in by hand,
 * same flow as covers/audio/trailer. When missing, the <video> element
 * fails gracefully and click still dismisses.
 */
const VIDEO_SRC = "/demo-assets/backup-video.mp4";

export default function BackupVideoOverlay({ enabled = false }: { enabled?: boolean }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const onOpen = () => setOpen(true);
    window.addEventListener(BACKUP_VIDEO_EVENT, onOpen);
    return () => window.removeEventListener(BACKUP_VIDEO_EVENT, onOpen);
  }, [enabled]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Backup demo recording"
      onClick={() => setOpen(false)}
      className="fixed inset-0 z-[3000] flex cursor-pointer items-center justify-center bg-black/95 backdrop-blur"
    >
      <video
        src={VIDEO_SRC}
        autoPlay
        controls
        playsInline
        className="max-h-screen max-w-full"
        onClick={(e) => e.stopPropagation()}
      />
      <p className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 text-[11px] font-medium uppercase tracking-[0.22em] text-white/70">
        Click anywhere or press Esc to close · backup recording
      </p>
    </div>
  );
}
