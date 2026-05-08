"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { resolveErrorMessage } from "@/lib/error-messages";
import {
  normalizeVisibility,
  describeVisibility,
  hasReadableContent,
  VISIBILITY_LABELS,
  PUBLISH_VISIBILITY_OPTIONS,
} from "../BookEditorView.helpers";
import type {
  Book,
  BookVersion,
  Chapter,
  PublishVisibility,
} from "../BookEditorView.types";

interface UsePublishingOptions {
  book: Book;
  bookTitle: string;
  chapters: Chapter[];
  activeVersion: BookVersion | null;
  displayCoverUrl: string | null;
  coverUploading: boolean;
  selectedChapter: Chapter | null;
  defaultPublishVisibility: PublishVisibility;
  authorDisplayNameSet?: boolean;
}

export function usePublishing({
  book,
  bookTitle,
  chapters,
  activeVersion,
  displayCoverUrl,
  coverUploading,
  selectedChapter,
  defaultPublishVisibility,
  authorDisplayNameSet = true,
}: UsePublishingOptions) {
  const router = useRouter();

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishVisibility, setPublishVisibility] = useState<PublishVisibility>("public");
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishToast, setPublishToast] = useState<string | null>(null);
  const [confirmPublishAction, setConfirmPublishAction] = useState<"publish" | "update" | "unpublish" | null>(null);
  const [publishMenuOpen, setPublishMenuOpen] = useState(false);
  const publishMenuButtonRef = useRef<HTMLButtonElement>(null);
  const publishMenuRef = useRef<HTMLDivElement>(null);

  // ---------------------------------------------------------------------------
  // Computed values
  // ---------------------------------------------------------------------------
  const activeVisibility = useMemo(
    () => normalizeVisibility(activeVersion?.visibility ?? null),
    [activeVersion?.visibility],
  );

  const isPublished = Boolean(activeVersion?.published_at);

  const missingPublishRequirements = useMemo(() => {
    const missing: string[] = [];
    if (!bookTitle.trim()) missing.push("Add a title");
    if (!displayCoverUrl) missing.push("Ladda upp en omslagsbild");
    if (!activeVersion?.id) missing.push("Create a book version");
    if (chapters.length === 0) {
      missing.push("Add at least one chapter");
    } else if (!chapters.some((chapter) => hasReadableContent(chapter.content))) {
      missing.push("Write content in at least one chapter");
    }
    if (!authorDisplayNameSet) {
      missing.push("Add a display name in your author profile");
    }
    return missing;
  }, [bookTitle, displayCoverUrl, activeVersion?.id, chapters, authorDisplayNameSet]);

  const publishedChapterCount =
    typeof activeVersion?.published_chapter_count === "number" &&
    Number.isFinite(activeVersion.published_chapter_count)
      ? Math.max(0, Math.floor(activeVersion.published_chapter_count))
      : null;

  const selectedChapterOrder =
    typeof selectedChapter?.order === "number" && Number.isFinite(selectedChapter.order)
      ? selectedChapter.order
      : null;

  const selectedChapterAlreadyPublished =
    Boolean(isPublished) &&
    (publishedChapterCount === null
      ? true
      : selectedChapterOrder != null && selectedChapterOrder < publishedChapterCount);

  const publishDisabled = isPublishing || coverUploading || missingPublishRequirements.length > 0;

  const chapterPublishDisabled =
    isPublishing ||
    coverUploading ||
    missingPublishRequirements.length > 0 ||
    !selectedChapter ||
    !hasReadableContent(selectedChapter.content) ||
    selectedChapterAlreadyPublished;

  const visibilityChanged = isPublished && activeVisibility != null && publishVisibility !== activeVisibility;

  const currentVisibility = activeVisibility ?? publishVisibility;
  const currentVisibilityLabel = VISIBILITY_LABELS[currentVisibility];
  const currentVisibilitySummary = describeVisibility(currentVisibility);
  const selectedVisibilityLabel = VISIBILITY_LABELS[publishVisibility];

  const confirmCopy =
    confirmPublishAction === "publish"
      ? `Publish this version as ${selectedVisibilityLabel}?`
      : confirmPublishAction === "update"
        ? `Uppdatera synlighet till ${selectedVisibilityLabel}?`
        : confirmPublishAction === "unpublish"
          ? "Unpublish this version? It will no longer be visible to readers."
          : null;

  const publishButtonClass =
    "flex items-center gap-2 rounded-full bg-[#0F172A] px-5 py-2.5 text-[13px] font-semibold text-white shadow-[0_1px_2px_rgba(15,23,42,0.3),inset_0_1px_0_rgba(255,255,255,0.08)] transition-all hover:bg-[#1E293B] hover:shadow-[0_4px_12px_rgba(15,23,42,0.35),inset_0_1px_0_rgba(255,255,255,0.08)] focus:outline-none focus:ring-2 focus:ring-[#0F172A]/50";

  // ---------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------

  // Auto-clear publish toast after 3 seconds.
  useEffect(() => {
    if (!publishToast) return;
    const timeoutId = window.setTimeout(() => setPublishToast(null), 3000);
    return () => window.clearTimeout(timeoutId);
  }, [publishToast]);

  // Close publish menu on outside click or Escape.
  useEffect(() => {
    if (!publishMenuOpen) return;
    const handleOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (publishMenuRef.current?.contains(target)) return;
      if (publishMenuButtonRef.current?.contains(target)) return;
      setPublishMenuOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPublishMenuOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [publishMenuOpen]);

  // Reset publish error and confirm action when the active version changes.
  useEffect(() => {
    setPublishError(null);
    setConfirmPublishAction(null);
  }, [activeVersion?.id]);

  // Sync publishVisibility with the active version.
  useEffect(() => {
    if (!activeVersion) return;
    const nextVisibility = activeVisibility ?? defaultPublishVisibility;
    setPublishVisibility(nextVisibility);
  }, [activeVersion, activeVisibility, defaultPublishVisibility]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handlePublishAction = async (action: "publish" | "update" | "unpublish") => {
    if (isPublishing || !activeVersion?.id) return;
    if (action === "publish" && missingPublishRequirements.length > 0) {
      setPublishError("Fix the requirements before publishing.");
      return;
    }
    setIsPublishing(true);
    setPublishError(null);
    let succeeded = false;
    try {
      const res = await fetch(`/api/books/${book.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          versionId: activeVersion.id,
          visibility: publishVisibility,
          action,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPublishError(resolveErrorMessage(data.error));
        return;
      }
      router.refresh();
      succeeded = true;
      if (action === "publish") {
        setPublishToast("Published");
      } else if (action === "unpublish") {
        setPublishToast("Unpublished");
      } else {
        setPublishToast("Publishing settings updated");
      }
    } catch {
      setPublishError("Could not update publishing settings. Try again.");
    } finally {
      setIsPublishing(false);
      setConfirmPublishAction(null);
      if (succeeded) setPublishMenuOpen(false);
    }
  };

  const handlePublishSelectedChapter = useCallback(async () => {
    if (isPublishing || !activeVersion?.id) return;
    if (!selectedChapter) {
      setPublishError("Select a chapter first.");
      return;
    }
    if (!hasReadableContent(selectedChapter.content)) {
      setPublishError("Selected chapter has no readable content.");
      return;
    }

    const chapterLabel = selectedChapter.title?.trim() || "selected chapter";
    const confirmed = window.confirm(`Publish only "${chapterLabel}" for readers now?`);
    if (!confirmed) return;

    setIsPublishing(true);
    setPublishError(null);
    let succeeded = false;
    try {
      const res = await fetch(`/api/books/${book.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          versionId: activeVersion.id,
          visibility: publishVisibility,
          action: "publish",
          scope: "chapter",
          chapterId: selectedChapter.id,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPublishError(resolveErrorMessage(data.error));
        return;
      }
      router.refresh();
      succeeded = true;
      setPublishToast(`Published chapter: ${chapterLabel}`);
    } catch {
      setPublishError("Could not publish selected chapter. Try again.");
    } finally {
      setIsPublishing(false);
      if (succeeded) setPublishMenuOpen(false);
    }
  }, [
    activeVersion?.id,
    book.id,
    isPublishing,
    publishVisibility,
    router,
    selectedChapter,
  ]);

  const handleChapterPublishToggle = useCallback(async (chapter: Chapter, shouldPublish: boolean) => {
    if (isPublishing || !activeVersion?.id) return;
    if (shouldPublish && !hasReadableContent(chapter.content)) {
      setPublishError("Chapter has no readable content.");
      return;
    }

    setIsPublishing(true);
    setPublishError(null);
    try {
      const res = await fetch(`/api/books/${book.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          versionId: activeVersion.id,
          visibility: publishVisibility,
          action: shouldPublish ? "publish" : "unpublish",
          scope: "chapter",
          chapterId: chapter.id,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPublishError(resolveErrorMessage(data.error));
        return;
      }
      router.refresh();
      const label = chapter.title?.trim() || "Chapter";
      setPublishToast(shouldPublish ? `Published: ${label}` : `Unpublished: ${label}`);
    } catch {
      setPublishError("Could not update chapter. Try again.");
    } finally {
      setIsPublishing(false);
    }
  }, [activeVersion?.id, book.id, isPublishing, publishVisibility, router]);

  // ---------------------------------------------------------------------------
  // Return
  // ---------------------------------------------------------------------------

  return {
    // State
    isPublishing,
    publishVisibility,
    setPublishVisibility,
    publishError,
    setPublishError,
    publishToast,
    setPublishToast,
    confirmPublishAction,
    setConfirmPublishAction,
    publishMenuOpen,
    setPublishMenuOpen,
    publishMenuButtonRef,
    publishMenuRef,

    // Computed
    activeVisibility,
    isPublished,
    missingPublishRequirements,
    publishDisabled,
    chapterPublishDisabled,
    selectedChapterAlreadyPublished,
    visibilityChanged,
    confirmCopy,
    publishButtonClass,
    currentVisibility,
    currentVisibilityLabel,
    currentVisibilitySummary,
    selectedVisibilityLabel,
    publishedChapterCount,
    selectedChapterOrder,

    // Handlers
    handlePublishAction,
    handlePublishSelectedChapter,
    handleChapterPublishToggle,

    // Re-export constants so consumers don't need a second import
    PUBLISH_VISIBILITY_OPTIONS,
  };
}
