"use client";

import { useState, useEffect, useCallback } from "react";

export type Highlight = {
  id: string;
  chapter_id: string;
  book_id: string;
  book_version_id: string;
  start_offset: number;
  end_offset: number;
  snippet: string;
  color: string;
  note: string | null;
  created_at: string;
  updated_at: string;
};

type AddHighlightInput = {
  chapter_id: string;
  book_id?: string;
  book_version_id?: string;
  start_offset: number;
  end_offset: number;
  snippet: string;
  color: string;
  note?: string;
};

type UpdateHighlightInput = {
  color?: string;
  note?: string | null;
};

export function useHighlights(chapterId: string | null) {
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchHighlights = useCallback(async () => {
    if (!chapterId) {
      setHighlights([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(`/api/reader/highlights?chapter_id=${chapterId}`);
      if (res.ok) {
        const json = await res.json();
        setHighlights(json.highlights ?? []);
      }
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }, [chapterId]);

  useEffect(() => {
    fetchHighlights();
  }, [fetchHighlights]);

  const addHighlight = useCallback(
    async (input: AddHighlightInput): Promise<Highlight | null> => {
      try {
        const res = await fetch("/api/reader/highlights", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        if (!res.ok) return null;
        const json = await res.json();
        const hl = json.highlight as Highlight;
        if (hl) {
          setHighlights((prev) =>
            [...prev, hl].sort((a, b) => a.start_offset - b.start_offset)
          );
        }
        return hl ?? null;
      } catch {
        return null;
      }
    },
    []
  );

  const updateHighlight = useCallback(
    async (id: string, input: UpdateHighlightInput): Promise<boolean> => {
      try {
        const res = await fetch(`/api/reader/highlights/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        if (!res.ok) return false;
        const json = await res.json();
        const updated = json.highlight as Highlight;
        if (updated) {
          setHighlights((prev) =>
            prev.map((h) => (h.id === id ? updated : h))
          );
        }
        return true;
      } catch {
        return false;
      }
    },
    []
  );

  const removeHighlight = useCallback(async (id: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/reader/highlights/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) return false;
      setHighlights((prev) => prev.filter((h) => h.id !== id));
      return true;
    } catch {
      return false;
    }
  }, []);

  return { highlights, addHighlight, updateHighlight, removeHighlight, isLoading, refetch: fetchHighlights };
}
