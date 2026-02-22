"use client";

import { useEffect, useId, useMemo, useState } from "react";
import NoDownloadAudioPlayer from "@/components/books/NoDownloadAudioPlayer";

type ManifestTrack = {
  id: string;
  title: string;
  order: number;
  chapterId: string;
  audioUrl: string | null;
  audioPath: string | null;
  durationSeconds: number | null;
};

type ManifestPayload = {
  chapters?: unknown;
};

function formatDuration(seconds: number | null): string {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) return "";
  const rounded = Math.round(seconds);
  const minutes = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export default function ManifestAudiobookPlayer({
  bookId,
  manifestUrl,
}: {
  bookId?: string;
  manifestUrl: string;
}) {
  const [tracks, setTracks] = useState<ManifestTrack[]>([]);
  const [activeTrackId, setActiveTrackId] = useState<string>("");
  const [activeTrackSrc, setActiveTrackSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const chapterSelectId = useId();

  useEffect(() => {
    let cancelled = false;

    const loadManifest = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(manifestUrl, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Manifest request failed (${response.status})`);
        }

        const payload = (await response.json()) as ManifestPayload;
        const rawChapters = Array.isArray(payload?.chapters) ? payload.chapters : [];

        const parsed = rawChapters
          .map((rawChapter, index): ManifestTrack | null => {
            if (!rawChapter || typeof rawChapter !== "object") return null;

            const chapter = rawChapter as Record<string, unknown>;
            const rawAudioUrl = typeof chapter.audioUrl === "string" ? chapter.audioUrl.trim() : "";
            const rawAudioPath = typeof chapter.audioPath === "string" ? chapter.audioPath.trim() : "";
            if (!rawAudioUrl && !rawAudioPath) return null;

            const rawId = typeof chapter.id === "string" ? chapter.id.trim() : "";
            const rawTitle = typeof chapter.title === "string" ? chapter.title.trim() : "";
            const rawOrder = typeof chapter.order === "number" && Number.isFinite(chapter.order) ? chapter.order : index;
            const rawDuration =
              typeof chapter.durationSeconds === "number" && Number.isFinite(chapter.durationSeconds)
                ? chapter.durationSeconds
                : null;
            const chapterId = rawId || `chapter-${index + 1}`;

            return {
              id: chapterId,
              chapterId,
              title: rawTitle || `Chapter ${index + 1}`,
              order: rawOrder,
              audioUrl: rawAudioUrl || null,
              audioPath: rawAudioPath || null,
              durationSeconds: rawDuration,
            };
          })
          .filter((track): track is ManifestTrack => track !== null)
          .sort((a, b) => a.order - b.order);

        if (!cancelled) {
          if (parsed.length === 0) {
            setTracks([]);
            setActiveTrackId("");
            setError("No chapter audio found in audiobook manifest.");
          } else {
            setTracks(parsed);
            setActiveTrackId((current) => (parsed.some((track) => track.id === current) ? current : parsed[0].id));
          }
        }
      } catch {
        if (!cancelled) {
          setTracks([]);
          setActiveTrackId("");
          setError("Could not load chapter-based audiobook playback.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadManifest();

    return () => {
      cancelled = true;
    };
  }, [manifestUrl]);

  const activeTrack = useMemo(() => {
    if (tracks.length === 0) return null;
    return tracks.find((track) => track.id === activeTrackId) ?? tracks[0];
  }, [activeTrackId, tracks]);
  const resolvedBookId = useMemo(() => {
    if (typeof bookId === "string" && bookId.trim().length > 0) return bookId.trim();
    if (typeof window === "undefined") return "";
    const segments = window.location.pathname.split("/").filter(Boolean);
    const booksIndex = segments.indexOf("books");
    if (booksIndex >= 0 && booksIndex + 1 < segments.length) {
      return segments[booksIndex + 1] ?? "";
    }
    return "";
  }, [bookId]);

  useEffect(() => {
    let cancelled = false;

    const loadTrackSrc = async () => {
      if (!activeTrack) {
        setActiveTrackSrc(null);
        return;
      }
      if (!resolvedBookId) {
        setActiveTrackSrc(null);
        setError("Could not resolve book for chapter playback.");
        return;
      }

      try {
        const params = new URLSearchParams({ chapterId: activeTrack.chapterId });
        const response = await fetch(`/api/books/${resolvedBookId}/audiobook/play?${params.toString()}`, {
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error(`Track playback request failed (${response.status})`);
        }

        const payload = (await response.json()) as { audioUrl?: unknown };
        const signedUrl =
          typeof payload.audioUrl === "string" && payload.audioUrl.trim().length > 0
            ? payload.audioUrl.trim()
            : null;

        if (!cancelled) {
          setActiveTrackSrc(signedUrl);
          if (!signedUrl) {
            setError("No chapter audio found in audiobook manifest.");
          }
        }
      } catch {
        if (!cancelled) {
          setActiveTrackSrc(null);
          setError("Could not load chapter-based audiobook playback.");
        }
      }
    };

    void loadTrackSrc();

    return () => {
      cancelled = true;
    };
  }, [activeTrack, resolvedBookId]);

  if (loading) {
    return (
      <p className="text-xs text-black-800/80 dark:text-black-200/80">
        Loading audiobook chapters...
      </p>
    );
  }

  if (error) {
    return (
      <p className="text-xs text-amber-800 dark:text-amber-300" role="alert">
        {error}
      </p>
    );
  }

  if (!activeTrack) {
    return null;
  }

  if (!activeTrackSrc) {
    return (
      <p className="text-xs text-amber-800 dark:text-amber-300" role="alert">
        Could not load chapter-based audiobook playback.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={chapterSelectId} className="text-xs font-medium text-black dark:text-[#7DBEF5]">
          Chapter audio
        </label>
        <span className="text-[11px] text-black dark:text-black">
          {tracks.length} tracks
        </span>
      </div>
      <select
        id={chapterSelectId}
        value={activeTrack.id}
        onChange={(event) => setActiveTrackId(event.target.value)}
        className="w-full rounded-lg border border-[#7DBEF5]/20 bg-white/20 px-3 py-2 text-xs text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-emerald-400/30 dark:bg-white/5 dark:text-white"
      >
        {tracks.map((track) => {
          const duration = formatDuration(track.durationSeconds);
          const prefix = Number.isFinite(track.order) ? `${Math.max(1, Math.floor(track.order) + 1)}. ` : "";
          return (
            <option key={`${track.id}-${track.order}`} value={track.id}>
              {duration ? `${prefix}${track.title} (${duration})` : `${prefix}${track.title}`}
            </option>
          );
        })}
      </select>
      <NoDownloadAudioPlayer src={activeTrackSrc} />
    </div>
  );
}
