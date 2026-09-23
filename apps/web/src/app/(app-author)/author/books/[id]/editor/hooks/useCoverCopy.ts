"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToastHelpers } from "@/components/ui/toast";
import { normalizeCoverCopy, type CoverCopy } from "@/lib/cover-copy";
import type { Book } from "../BookEditorView.types";

export type CoverCopySaveState = "idle" | "saving" | "saved" | "error";

export function useCoverCopy({ book }: { book: Book }) {
  const toast = useToastHelpers();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const [coverCopy, setCoverCopy] = useState<CoverCopy>(() => normalizeCoverCopy(book.cover_copy));
  const [saveState, setSaveState] = useState<CoverCopySaveState>("idle");

  const [prevCoverCopyProp, setPrevCoverCopyProp] = useState(book.cover_copy);
  if (prevCoverCopyProp !== book.cover_copy) {
    setPrevCoverCopyProp(book.cover_copy);
    setCoverCopy(normalizeCoverCopy(book.cover_copy));
  }

  const requestId = useRef(0);
  const announcedError = useRef(false);
  const timer = useRef<number | null>(null);
  const latest = useRef(coverCopy);
  const dirty = useRef(false);
  latest.current = coverCopy;

  const persist = useCallback(
    async (next: CoverCopy) => {
      const id = ++requestId.current;
      const normalized = normalizeCoverCopy(next);
      setSaveState("saving");

      const supabase = createClient();
      const { error } = await supabase
        .from("books")
        .update({ cover_copy: normalized } as never)
        .eq("id", book.id);

      if (id !== requestId.current) return;

      if (error) {
        setSaveState("error");
        if (!announcedError.current) {
          announcedError.current = true;
          toastRef.current.error("Could not save cover text. Try again.");
        }
        return;
      }

      announcedError.current = false;
      dirty.current = false;
      setSaveState("saved");
    },
    [book.id]
  );

  const persistRef = useRef(persist);
  persistRef.current = persist;

  const updateCoverCopy = useCallback(
    (next: CoverCopy) => {
      const normalized = normalizeCoverCopy(next);
      setCoverCopy(normalized);
      latest.current = normalized;
      dirty.current = true;
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        void persist(normalized);
      }, 400);
    },
    [persist]
  );

  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
      if (dirty.current) void persistRef.current(latest.current);
    };
  }, []);

  return { coverCopy, updateCoverCopy, saveState };
}
