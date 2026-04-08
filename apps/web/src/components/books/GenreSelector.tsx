"use client";

import { useState, useEffect, useCallback } from "react";
import { Sparkles } from "lucide-react";

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
  const [suggesting, setSuggesting] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);

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

  const suggest = useCallback(async () => {
    setSuggesting(true);
    setSuggestError(null);
    try {
      const res = await fetch(`/api/books/${bookId}/genres/suggest`, {
        method: "POST",
      });
      if (!res.ok) {
        setSuggestError("Could not analyse text. Try again.");
        return;
      }
      const data = await res.json();
      const ids = (data.genreIds ?? []) as string[];
      if (ids.length === 0) {
        setSuggestError("No clear genre detected — pick manually.");
        return;
      }
      setSelected(new Set(ids));
      setSaved(false);
    } catch {
      setSuggestError("Something went wrong. Try again.");
    } finally {
      setSuggesting(false);
    }
  }, [bookId]);

  if (!loaded) {
    return (
      <div className="mt-4 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-white/50">
          Genres
        </p>
        <div className="h-8 w-32 animate-pulse rounded bg-slate-200 dark:bg-white/10" />
      </div>
    );
  }

  if (genres.length === 0) return null;

  return (
    <div className="mt-4 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-white/50">
          Genres <span className="normal-case font-normal">(max 3)</span>
        </p>
        <button
          type="button"
          onClick={suggest}
          disabled={suggesting}
          title="Analyse book content and auto-select genres"
          className="inline-flex items-center gap-1.5 rounded-full border border-[#907AFF]/30 bg-[#907AFF]/[0.07] px-2.5 py-1 text-[11px] font-medium text-[#907AFF] transition hover:bg-[#907AFF]/[0.13] disabled:opacity-50 dark:border-[#907AFF]/25 dark:text-[#B8A8FF]"
        >
          <Sparkles className="h-3 w-3" />
          {suggesting ? "Analysing…" : "Suggest"}
        </button>
      </div>

      {suggestError && (
        <p className="text-[11px] text-rose-500 dark:text-rose-400">{suggestError}</p>
      )}

      <div className="flex flex-wrap gap-1.5">
        {genres.map((genre) => {
          const isSelected = selected.has(genre.id);
          const isDisabled = !isSelected && selected.size >= 3;
          return (
            <button
              key={genre.id}
              type="button"
              onClick={() => toggle(genre.id)}
              disabled={isDisabled}
              title={isDisabled ? "Max 3 genres" : undefined}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                isSelected
                  ? "border-[#907AFF]/50 bg-[#907AFF]/15 text-[#5c4bb8] dark:border-[#B8A8FF]/50 dark:bg-[#907AFF]/20 dark:text-[#B8A8FF]"
                  : isDisabled
                    ? "cursor-not-allowed border-slate-200 bg-white text-slate-300 dark:border-white/10 dark:bg-white/5 dark:text-white/25"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-white/60 dark:hover:bg-white/10"
              }`}
            >
              {genre.icon ? `${genre.icon} ` : ""}
              {genre.name_en}
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
          {saving ? "Saving..." : saved ? "Saved ✓" : "Save genres"}
        </button>
      )}
    </div>
  );
}
