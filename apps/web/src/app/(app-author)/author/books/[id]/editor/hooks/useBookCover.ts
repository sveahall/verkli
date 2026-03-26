"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { uploadBookCover } from "@/lib/supabase/storage";
import { useToastHelpers } from "@/components/ui/toast";
import { resolveErrorMessage } from "@/lib/error-messages";
import {
  isAcceptedCoverFile,
  getGeneratedCoverExtension,
} from "../BookEditorView.helpers";
import type { Book } from "../BookEditorView.types";

interface UseBookCoverOptions {
  book: Book;
}

export function useBookCover({ book }: UseBookCoverOptions) {
  const router = useRouter();
  const toast = useToastHelpers();
  const coverInputRef = useRef<HTMLInputElement>(null);

  const [coverUploading, setCoverUploading] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
  const [coverDropActive, setCoverDropActive] = useState(false);
  const [coverAIPrompt, setCoverAIPrompt] = useState("");
  const [coverAIStyle, setCoverAIStyle] = useState("minimal");
  const [coverAIGeneratedUrls, setCoverAIGeneratedUrls] = useState<string[]>([]);
  const [coverAIGenerating, setCoverAIGenerating] = useState(false);
  const [coverAIError, setCoverAIError] = useState<string | null>(null);
  const [coverCropSrc, setCoverCropSrc] = useState<string | null>(null);
  const [coverAIPreviewUrl, setCoverAIPreviewUrl] = useState<string | null>(null);

  const displayCoverUrl = coverPreviewUrl ?? book.cover_image;

  // Sync preview URL when book prop changes
  useEffect(() => {
    if (book.cover_image && coverPreviewUrl && book.cover_image === coverPreviewUrl) {
      setCoverPreviewUrl(null);
    }
  }, [book.cover_image, coverPreviewUrl]);

  const saveCoverFile = useCallback(
    async (file: File, optimisticPreviewUrl?: string | null) => {
      const previousCoverUrl = displayCoverUrl;
      const nextPreviewUrl = optimisticPreviewUrl?.trim() || null;

      setCoverError(null);
      if (nextPreviewUrl) setCoverPreviewUrl(nextPreviewUrl);
      setCoverUploading(true);

      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setCoverError("You must be signed in to upload a cover.");
          setCoverPreviewUrl(previousCoverUrl ?? null);
          return false;
        }

        const { url, error: uploadError } = await uploadBookCover(file, user.id, book.id);
        if (uploadError || !url) {
          setCoverError("Cover upload failed. Try again.");
          setCoverPreviewUrl(previousCoverUrl ?? null);
          return false;
        }

        const { error: updateError } = await supabase
          .from("books")
          .update({ cover_image: url })
          .eq("id", book.id);

        if (updateError) {
          setCoverError("Could not save cover. Try again.");
          setCoverPreviewUrl(previousCoverUrl ?? null);
          return false;
        }

        setCoverPreviewUrl(`${url}?t=${Date.now()}`);
        toast.success("Cover saved.");
        router.refresh();
        return true;
      } finally {
        setCoverUploading(false);
        if (coverInputRef.current) coverInputRef.current.value = "";
      }
    },
    [book.id, displayCoverUrl, router, toast]
  );

  const handleRemoveCover = useCallback(async () => {
    setCoverError(null);
    setCoverUploading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("books")
        .update({ cover_image: null })
        .eq("id", book.id);
      if (error) {
        setCoverError("Could not remove cover. Try again.");
        return;
      }
      setCoverPreviewUrl(null);
      toast.success("Cover removed.");
      router.refresh();
    } finally {
      setCoverUploading(false);
    }
  }, [book.id, router, toast]);

  const handleCropSave = useCallback(
    async (file: File) => {
      await saveCoverFile(file);
    },
    [saveCoverFile]
  );

  const handleCoverFileSelect = useCallback(
    async (file: File | null) => {
      if (!file) return;
      if (!isAcceptedCoverFile(file)) {
        setCoverError("Use a JPG or PNG file.");
        if (coverInputRef.current) coverInputRef.current.value = "";
        return;
      }
      const localPreviewUrl = URL.createObjectURL(file);
      await saveCoverFile(file, localPreviewUrl);
      URL.revokeObjectURL(localPreviewUrl);
    },
    [saveCoverFile]
  );

  const handleCoverChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      await handleCoverFileSelect(e.target.files?.[0] ?? null);
    },
    [handleCoverFileSelect]
  );

  const handleCoverDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setCoverDropActive(false);
      if (coverUploading) return;
      await handleCoverFileSelect(e.dataTransfer.files?.[0] ?? null);
    },
    [coverUploading, handleCoverFileSelect]
  );

  const handleCoverAIGenerate = useCallback(async () => {
    if (coverAIGenerating) return;
    const prompt = coverAIPrompt.trim();
    if (!prompt) {
      setCoverAIError(resolveErrorMessage("PROMPT_TEXT_REQUIRED"));
      return;
    }
    setCoverAIError(null);
    setCoverError(null);
    setCoverAIGenerating(true);
    setCoverAIGeneratedUrls([]);
    try {
      const res = await fetch(`/api/books/${book.id}/cover/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, style: coverAIStyle }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCoverAIError(
          resolveErrorMessage(data?.error, "Could not generate cover options. Try again.")
        );
        return;
      }
      const images = Array.isArray(data?.images)
        ? data.images.filter((value: unknown): value is string => typeof value === "string")
        : [];
      if (images.length < 4) {
        setCoverAIError("Could not generate cover options. Try again.");
        return;
      }
      setCoverAIGeneratedUrls(images.slice(0, 4));
    } catch {
      setCoverAIError("Could not generate cover options. Try again.");
    } finally {
      setCoverAIGenerating(false);
    }
  }, [book.id, coverAIGenerating, coverAIPrompt, coverAIStyle]);

  const handleCoverSetFromGenerated = useCallback(
    async (url: string) => {
      if (coverUploading) return;
      setCoverAIError(null);
      setCoverError(null);
      try {
        const response = await fetch(url);
        if (!response.ok) {
          setCoverError("Could not download generated cover. Try again.");
          return;
        }
        const blob = await response.blob();
        const extension = getGeneratedCoverExtension(
          response.headers.get("content-type") || blob.type,
          url
        );
        const file = new File([blob], `generated-cover.${extension}`, {
          type: blob.type || response.headers.get("content-type") || "image/png",
        });
        await saveCoverFile(file, url);
      } catch {
        setCoverError("Could not save generated cover. Try again.");
      }
    },
    [coverUploading, saveCoverFile]
  );

  return {
    coverInputRef,
    coverUploading,
    coverError,
    coverPreviewUrl,
    displayCoverUrl,
    coverDropActive,
    setCoverDropActive,
    coverAIPrompt,
    setCoverAIPrompt,
    coverAIStyle,
    setCoverAIStyle,
    coverAIGeneratedUrls,
    coverAIGenerating,
    coverAIError,
    setCoverAIError,
    coverCropSrc,
    setCoverCropSrc,
    coverAIPreviewUrl,
    setCoverAIPreviewUrl,
    handleRemoveCover,
    handleCropSave,
    handleCoverChange,
    handleCoverDrop,
    handleCoverAIGenerate,
    handleCoverSetFromGenerated,
  };
}
