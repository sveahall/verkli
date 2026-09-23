"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToastHelpers } from "@/components/ui/toast";
import { normalizeCoverCopy, type CoverCopy } from "@/lib/cover-copy";

// A reopened editor must wait for the previous instance to finish flushing.
// This orders writes within this browser context, not across devices or tabs.
const bookWriteQueues = new Map<string, Promise<void>>();

export type CoverCopySaveState = "idle" | "saving" | "saved" | "error";

export function useCoverCopy({ book }: { book: { id: string; cover_copy?: unknown } }) {
  const toast = useToastHelpers();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const [coverCopy, setCoverCopy] = useState<CoverCopy>(() => normalizeCoverCopy(book.cover_copy));
  const [saveState, setSaveState] = useState<CoverCopySaveState>("idle");
  // Each book owns its queue, including writes flushed after leaving its editor.
  const session = useMemo(() => ({
    bookId: book.id,
    revision: 0,
    queuedRevision: -1,
    timer: null as number | null,
    pending: null as (() => void) | null,
    active: true,
    announcedError: false,
  }), [book.id]);

  const [previous, setPrevious] = useState({ id: book.id, copy: book.cover_copy });
  if (previous.id !== book.id || previous.copy !== book.cover_copy) {
    setPrevious({ id: book.id, copy: book.cover_copy });
    if (previous.id !== book.id || !session.pending) setCoverCopy(normalizeCoverCopy(book.cover_copy));
    if (previous.id !== book.id) setSaveState("idle");
  }

  const persist = useCallback((next: CoverCopy, revision: number) => {
    if (session.queuedRevision === revision) return;
    session.queuedRevision = revision;
    const queued = (bookWriteQueues.get(session.bookId) ?? Promise.resolve()).then(async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("books")
          .update({ cover_copy: normalizeCoverCopy(next) } as never)
          .eq("id", session.bookId)
          .select("id")
          .maybeSingle();
        if (error || !data) throw new Error("Cover text was not saved.");
        if (revision !== session.revision) return;
        session.pending = null;
        session.announcedError = false;
        if (session.active) setSaveState("saved");
      } catch {
        if (revision !== session.revision) return;
        session.queuedRevision = -1;
        if (session.active) setSaveState("error");
        if (!session.announcedError) {
          session.announcedError = true;
          toastRef.current.error("Could not save cover text. Try again.");
        }
      }
    });
    bookWriteQueues.set(session.bookId, queued);
    void queued.then(() => {
      if (bookWriteQueues.get(session.bookId) === queued) bookWriteQueues.delete(session.bookId);
    });
  }, [session]);

  const updateCoverCopy = useCallback((next: CoverCopy) => {
    const normalized = normalizeCoverCopy(next, { preserveWhitespace: true });
    const revision = ++session.revision;
    setCoverCopy(normalized);
    setSaveState("saving");
    const save = () => persist(normalized, revision);
    session.pending = save;
    if (session.timer !== null) window.clearTimeout(session.timer);
    session.timer = window.setTimeout(() => {
      session.timer = null;
      save();
    }, 400);
  }, [persist, session]);

  useEffect(() => {
    session.active = true;
    return () => {
      session.active = false;
      if (session.timer !== null) window.clearTimeout(session.timer);
      session.timer = null;
      session.pending?.();
    };
  }, [session]);

  return { coverCopy, updateCoverCopy, saveState };
}
