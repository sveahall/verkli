"use client";

import { useState, useEffect, useCallback } from "react";

interface Genre {
  id: string;
  slug: string;
  name_sv: string;
  name_en: string;
  icon: string | null;
}

interface GenreSelectorProps {
  bookId: string;
}

export default function GenreSelector({ bookId }: GenreSelectorProps) {
  const [genres, setGenres] = useState<Genre[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [genresRes, bookGenresRes] = await Promise.all([
          fetch("/api/genres"),
          fetch(`/api/books/${bookId}/genres`),
        ]);

        if (cancelled) return;

        if (genresRes.ok) {
          const data = await genresRes.json();
          setGenres(data.genres ?? []);
        }

        if (bookGenresRes.ok) {
          const data = await bookGenresRes.json();
          const ids = (data.genreIds ?? []) as string[];
          setSelected(new Set(ids));
        }
      } catch {
        // Non-blocking
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [bookId]);

  const toggle = useCallback((genreId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(genreId)) {
        next.delete(genreId);
      } else if (next.size < 3) {
        next.add(genreId);
      }
      return next;
    });
    setSaved(false);
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/books/${bookId}/genres`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ genreIds: [...selected] }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch {
      // Ignore
    } finally {
      setSaving(false);
    }
  }, [bookId, selected]);

  if (!loaded) {
    return (
      <div className="mt-4 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-white/50">Genrer</p>
        <div className="h-8 w-32 animate-pulse rounded bg-slate-200 dark:bg-white/10" />
      </div>
    );
  }

  if (genres.length === 0) return null;

  return (
    <div className="mt-4 space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-white/50">
        Genrer (max 3)
      </p>
      <div className="flex flex-wrap gap-1.5">
        {genres.map((genre) => {
          const isSelected = selected.has(genre.id);
          return (
            <button
              key={genre.id}
              type="button"
              onClick={() => toggle(genre.id)}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                isSelected
                  ? "border-[#907AFF]/50 bg-[#907AFF]/15 text-[#5c4bb8] dark:border-[#B8A8FF]/50 dark:bg-[#907AFF]/20 dark:text-[#B8A8FF]"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-white/60 dark:hover:bg-white/10"
              }`}
            >
              {genre.icon ? `${genre.icon} ` : ""}{genre.name_sv}
            </button>
          );
        })}
      </div>
      {selected.size > 0 && (
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="mt-1 rounded-full bg-slate-900 px-3 py-1 text-[11px] font-medium text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-white/90"
        >
          {saving ? "Sparar..." : saved ? "Sparat" : "Spara genrer"}
        </button>
      )}
    </div>
  );
}
