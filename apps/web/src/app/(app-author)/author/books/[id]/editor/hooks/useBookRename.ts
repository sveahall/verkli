"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Book } from "../BookEditorView.types";

interface UseBookRenameOptions {
  book: Book;
}

export function useBookRename({ book }: UseBookRenameOptions) {
  const router = useRouter();

  // Derive bookTitle directly from the prop — no sync effect needed.
  // After save, router.refresh() updates the prop with the new title.
  const bookTitle = book.title ?? "Untitled";

  const [isRenamingBook, setIsRenamingBook] = useState(false);
  const [bookTitleDraft, setBookTitleDraft] = useState(bookTitle);
  const [bookTitleError, setBookTitleError] = useState<string | null>(null);
  const [bookTitleSaving, setBookTitleSaving] = useState(false);

  const handleStartRenameBook = useCallback(() => {
    setBookTitleError(null);
    setBookTitleDraft(bookTitle);
    setIsRenamingBook(true);
  }, [bookTitle]);

  const handleCancelRenameBook = useCallback(() => {
    setBookTitleError(null);
    setBookTitleDraft(bookTitle);
    setIsRenamingBook(false);
  }, [bookTitle]);

  const handleSaveRenameBook = useCallback(async () => {
    if (bookTitleSaving) return;
    const trimmed = bookTitleDraft.trim();
    if (!trimmed) {
      setBookTitleError("Title cannot be empty.");
      return;
    }
    if (trimmed.length > 120) {
      setBookTitleError("Title is too long (max 120 characters).");
      return;
    }
    if (trimmed === bookTitle) {
      setIsRenamingBook(false);
      return;
    }
    setBookTitleSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from("books").update({ title: trimmed }).eq("id", book.id);
    if (error) {
      setBookTitleError("Could not save title. Try again.");
      setBookTitleSaving(false);
      return;
    }
    setIsRenamingBook(false);
    setBookTitleSaving(false);
    router.refresh();
  }, [bookTitleDraft, bookTitle, book.id, bookTitleSaving, router]);

  return {
    bookTitle,
    isRenamingBook,
    bookTitleDraft,
    setBookTitleDraft,
    bookTitleError,
    bookTitleSaving,
    handleStartRenameBook,
    handleCancelRenameBook,
    handleSaveRenameBook,
  };
}
