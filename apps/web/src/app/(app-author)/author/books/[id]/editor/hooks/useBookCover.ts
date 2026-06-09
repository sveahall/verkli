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
  COVER_TEMPLATES,
  buildTemplatePrompt,
} from "../BookEditorView.helpers";
import type { Book } from "../BookEditorView.types";

interface UseBookCoverOptions {
  book: Book;
  /**
   * Demo-only: when true, the AI cover generation races a 15s timeout. On
   * timeout (or any error) the four pre-baked /demo-assets/covers/0[1-4].svg
   * fallbacks are surfaced so the demo never stalls. The "Generated just
   * now" badge in the UI is rendered regardless of source.
   */
  demoFallbackEnabled?: boolean;
}

const DEMO_COVER_TIMEOUT_MS = 15_000;
/**
 * When the live SD3 call fails (or times out) in demo mode, we don't snap
 * the fallback PNGs onto the screen instantly — that would deflate the
 * "Generated just now"-replik on stage. Instead we hold the loader for a
 * minimum window and tick a progress phrase so the audience sees the
 * machine "thinking". After the floor we set the generated URLs and the
 * panel staggers them in 250 ms apart per index.
 */
const DEMO_FALLBACK_MIN_DURATION_MS = 8_000;
const DEMO_FALLBACK_COVERS: ReadonlyArray<string> = [
  "/demo-assets/covers/01.jpg",
  "/demo-assets/covers/02.jpg",
  "/demo-assets/covers/03.jpg",
  "/demo-assets/covers/04.jpg",
];

export type DemoCoverPhase =
  | "idle"
  | "analyzing" // 0–3 s   "Analyzing book context…"
  | "generating" // 3–6 s "Generating cover variations…"
  | "rendering" // 6–8 s  "Rendering 4 styles…"
  | "done";

export function useBookCover({ book, demoFallbackEnabled = false }: UseBookCoverOptions) {
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
  /**
   * Tracks the source of the most-recent generation. "live" when NVIDIA
   * SD3 returned within the timeout window, "fallback" when we swapped to
   * the pre-baked SVG covers. The cover panel uses this to render the
   * "Generated just now" badge without ever leaking the source.
   */
  const [coverAIGeneratedSource, setCoverAIGeneratedSource] = useState<
    "live" | "fallback" | null
  >(null);
  /**
   * Pacing phase exposed to the cover panel. Only meaningful during the
   * demo-fallback path; idle/done in every other case so the existing UI
   * treats it as a no-op.
   */
  const [coverAIPhase, setCoverAIPhase] = useState<DemoCoverPhase>("idle");
  const [coverCropSrc, setCoverCropSrc] = useState<string | null>(null);
  const [coverAIPreviewUrl, setCoverAIPreviewUrl] = useState<string | null>(null);
  const [coverAITemplate, setCoverAITemplate] = useState<string | null>(COVER_TEMPLATES[0]?.id ?? null);
  const [coverAITemplateFields, setCoverAITemplateFields] = useState<Record<string, string>>({});

  /**
   * Demo-only local cover lifecycle. The pitch displays a local asset
   * (decoupled from Supabase for wifi-resilience), so the Replace / Edit /
   * Crop / Remove affordances operate on local state instead of persisting —
   * instant, network-free, and reset on refresh between rehearsals.
   */
  const [demoCoverOverride, setDemoCoverOverride] = useState<string | null>(null);
  const [demoCoverRemoved, setDemoCoverRemoved] = useState(false);

  const displayCoverUrl = coverPreviewUrl ?? book.cover_image;

  /**
   * Effective cover URL shown in demo mode: a freshly-previewed AI cover wins,
   * then any locally edited/uploaded override, then the seeded demo asset.
   * Null only after the presenter removes it (surfaces the empty + Generate
   * state, which is the whole point of making the demo cover deletable).
   */
  const demoCoverUrl =
    coverAIPreviewUrl ??
    (demoCoverRemoved ? null : demoCoverOverride ?? "/demo-assets/covers/01.jpg");

  /**
   * Persist the demo cover lifecycle to localStorage so Remove / Replace /
   * Edit / Crop survive a page refresh — the pitch is judged by refreshing,
   * and localStorage keeps it instant + offline (no Supabase round-trip).
   */
  const demoCoverStorageKey = `verkli_demo_cover_${book.id}`;
  const persistDemoCover = useCallback(
    (next: { removed: boolean; override: string | null }) => {
      if (typeof window === "undefined") return;
      try {
        if (!next.removed && !next.override) {
          window.localStorage.removeItem(demoCoverStorageKey);
        } else {
          window.localStorage.setItem(demoCoverStorageKey, JSON.stringify(next));
        }
      } catch {
        // Quota exceeded or storage disabled — in-session state still works.
      }
    },
    [demoCoverStorageKey]
  );

  // Rehydrate the demo cover lifecycle from localStorage on mount (demo only).
  // Server + first client render use the seeded defaults (removed=false),
  // then this effect applies any persisted removal/override — no SSR mismatch.
  useEffect(() => {
    if (!demoFallbackEnabled || typeof window === "undefined") return;
    // Always sync to THIS book's stored state (or defaults when absent), so a
    // previous book's removal/override never leaks if the hook re-keys to a
    // different bookId without a fresh localStorage entry.
    let removed = false;
    let override: string | null = null;
    try {
      const raw = window.localStorage.getItem(demoCoverStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as { removed?: boolean; override?: string | null };
        removed = Boolean(parsed.removed);
        override = typeof parsed.override === "string" ? parsed.override : null;
      }
    } catch {
      // Corrupt entry — fall back to defaults (seeded cover).
    }
    setDemoCoverRemoved(removed);
    setDemoCoverOverride(override);
  }, [demoFallbackEnabled, demoCoverStorageKey]);

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

  /**
   * Demo-only: swap the displayed cover to a local object URL produced by an
   * upload / crop / editor save. No Supabase write — keeps the pitch instant
   * and offline-safe. Revokes the previous blob URL to avoid leaks.
   */
  const applyDemoLocalCover = useCallback(
    (file: File) =>
      // Resolves once the image is read + persisted, so callers can await
      // before toasting / closing a modal (no early success on a not-yet-set
      // cover). Read as a data URL (not an object URL) so it survives a
      // refresh once persisted to localStorage — object URLs die with the page.
      new Promise<boolean>((resolve) => {
        setCoverError(null);
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = typeof reader.result === "string" ? reader.result : null;
          if (!dataUrl) {
            setCoverError("Could not read image. Try again.");
            resolve(false);
            return;
          }
          setDemoCoverOverride(dataUrl);
          setDemoCoverRemoved(false);
          setCoverAIPreviewUrl(null);
          persistDemoCover({ removed: false, override: dataUrl });
          resolve(true);
        };
        reader.onerror = () => {
          setCoverError("Could not read image. Try again.");
          resolve(false);
        };
        reader.readAsDataURL(file);
      }),
    [persistDemoCover]
  );

  /** Demo-only: clear the local cover so the empty + Generate state shows. */
  const handleDemoRemoveCover = useCallback(() => {
    setDemoCoverOverride(null);
    setDemoCoverRemoved(true);
    setCoverAIPreviewUrl(null);
    persistDemoCover({ removed: true, override: null });
    toast.success("Cover removed.");
  }, [persistDemoCover, toast]);

  const handleCropSave = useCallback(
    async (file: File) => {
      if (demoFallbackEnabled) {
        if (await applyDemoLocalCover(file)) toast.success("Cover updated.");
        return;
      }
      await saveCoverFile(file);
    },
    [demoFallbackEnabled, applyDemoLocalCover, saveCoverFile, toast]
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
      const file = e.target.files?.[0] ?? null;
      if (demoFallbackEnabled) {
        if (coverInputRef.current) coverInputRef.current.value = "";
        if (!file) return;
        if (!isAcceptedCoverFile(file)) {
          setCoverError("Use a JPG or PNG file.");
          return;
        }
        if (await applyDemoLocalCover(file)) toast.success("Cover updated.");
        return;
      }
      await handleCoverFileSelect(file);
    },
    [demoFallbackEnabled, applyDemoLocalCover, handleCoverFileSelect, toast]
  );

  const handleCoverDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setCoverDropActive(false);
      if (coverUploading) return;
      const file = e.dataTransfer.files?.[0] ?? null;
      if (demoFallbackEnabled) {
        if (!file) return;
        if (!isAcceptedCoverFile(file)) {
          setCoverError("Use a JPG or PNG file.");
          return;
        }
        if (await applyDemoLocalCover(file)) toast.success("Cover updated.");
        return;
      }
      await handleCoverFileSelect(file);
    },
    [coverUploading, demoFallbackEnabled, applyDemoLocalCover, handleCoverFileSelect, toast]
  );

  const handleCoverAIGenerate = useCallback(async () => {
    if (coverAIGenerating) return;
    let prompt: string;
    if (coverAITemplate) {
      prompt = buildTemplatePrompt(coverAITemplate, coverAITemplateFields) ?? "";
    } else {
      prompt = coverAIPrompt.trim();
    }
    if (!prompt) {
      setCoverAIError(resolveErrorMessage("PROMPT_TEXT_REQUIRED"));
      return;
    }
    setCoverAIError(null);
    setCoverError(null);
    setCoverAIGenerating(true);
    setCoverAIGeneratedUrls([]);
    setCoverAIGeneratedSource(null);
    setCoverAIPhase(demoFallbackEnabled ? "analyzing" : "idle");

    const liveCall = async (): Promise<string[] | null> => {
      const res = await fetch(`/api/books/${book.id}/cover/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, style: coverAIStyle }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (!demoFallbackEnabled) {
          setCoverAIError(
            resolveErrorMessage(data?.error, "Could not generate cover options. Try again.")
          );
        }
        return null;
      }
      const images = Array.isArray(data?.images)
        ? data.images.filter((value: unknown): value is string => typeof value === "string")
        : [];
      return images.length >= 4 ? images.slice(0, 4) : null;
    };

    // Cmd+Shift+D failover: degraded mode skips the live API + 8s loader
    // entirely and snaps the fallback covers onto the screen. Set by the
    // demo hotkey handler when the presenter knows ahead of time that
    // network is bad.
    const degradedMode =
      typeof window !== "undefined" &&
      window.localStorage.getItem("demo_degraded_mode") === "1";

    try {
      if (demoFallbackEnabled && degradedMode) {
        setCoverAIPhase("done");
        setCoverAIGeneratedUrls([...DEMO_FALLBACK_COVERS]);
        setCoverAIGeneratedSource("fallback");
      } else if (demoFallbackEnabled) {
        // Race the live call against a 15s timeout. Whichever resolves
        // first wins. On live-success the phase ticks straight to "done"
        // and the result lands. On timeout / error / null we hold the
        // loader for a minimum 8s window with rolling progress text, then
        // surface the pre-baked PNGs — the panel staggers them 250 ms
        // apart per index so they don't snap in all at once.
        const startedAt = Date.now();
        const timeoutSentinel = Symbol("timeout");
        const phaseTimers: Array<ReturnType<typeof setTimeout>> = [];
        // 0 ms: phase already set to "analyzing" above. Schedule the
        // 3s and 6s ticks; cleared if live wins early.
        phaseTimers.push(setTimeout(() => setCoverAIPhase("generating"), 3_000));
        phaseTimers.push(setTimeout(() => setCoverAIPhase("rendering"), 6_000));

        const liveResult = await Promise.race<string[] | null | typeof timeoutSentinel>([
          liveCall().catch(() => null),
          new Promise<typeof timeoutSentinel>((resolve) =>
            setTimeout(() => resolve(timeoutSentinel), DEMO_COVER_TIMEOUT_MS)
          ),
        ]);

        if (liveResult && liveResult !== timeoutSentinel) {
          // Live wins — clear the staged ticks and surface the result.
          for (const t of phaseTimers) clearTimeout(t);
          setCoverAIPhase("done");
          setCoverAIGeneratedUrls(liveResult);
          setCoverAIGeneratedSource("live");
        } else {
          // Fallback path — enforce minimum loader floor before swapping.
          const elapsed = Date.now() - startedAt;
          const remaining = Math.max(0, DEMO_FALLBACK_MIN_DURATION_MS - elapsed);
          if (remaining > 0) {
            await new Promise((resolve) => setTimeout(resolve, remaining));
          }
          for (const t of phaseTimers) clearTimeout(t);
          setCoverAIPhase("done");
          setCoverAIGeneratedUrls([...DEMO_FALLBACK_COVERS]);
          setCoverAIGeneratedSource("fallback");
        }
      } else {
        const images = await liveCall();
        if (!images) {
          if (!coverAIError) {
            setCoverAIError("Could not generate cover options. Try again.");
          }
          return;
        }
        setCoverAIGeneratedUrls(images);
        setCoverAIGeneratedSource("live");
      }
    } catch {
      if (demoFallbackEnabled) {
        // Even on unexpected throws, show the fallback in demo mode so
        // the pitch never lands on an error toast.
        setCoverAIGeneratedUrls([...DEMO_FALLBACK_COVERS]);
        setCoverAIGeneratedSource("fallback");
      } else {
        setCoverAIError("Could not generate cover options. Try again.");
      }
    } finally {
      setCoverAIGenerating(false);
    }
  }, [book.id, coverAIGenerating, coverAIPrompt, coverAIStyle, coverAITemplate, coverAITemplateFields, coverAIError, demoFallbackEnabled]);

  const handleCoverSetFromGenerated = useCallback(
    async (url: string) => {
      if (demoFallbackEnabled) {
        // Demo: adopt the chosen cover locally + persist so it survives a
        // refresh and clears any prior removal — no Supabase round-trip.
        // Local/cached assets (/demo-assets/*, data:) are stored as-is (tiny,
        // SW-cached). A remote live-SD3 URL is fetched to a data URL first so
        // it doesn't break on refresh/offline.
        if (url.startsWith("/") || url.startsWith("data:")) {
          setDemoCoverOverride(url);
          setDemoCoverRemoved(false);
          setCoverAIPreviewUrl(null);
          persistDemoCover({ removed: false, override: url });
          toast.success("Cover updated.");
          return;
        }
        try {
          const response = await fetch(url);
          const blob = await response.blob();
          const file = new File([blob], "generated-cover", {
            type: blob.type || "image/png",
          });
          if (await applyDemoLocalCover(file)) toast.success("Cover updated.");
        } catch {
          // Network failed — store the URL directly as a best-effort fallback.
          setDemoCoverOverride(url);
          setDemoCoverRemoved(false);
          setCoverAIPreviewUrl(null);
          persistDemoCover({ removed: false, override: url });
          toast.success("Cover updated.");
        }
        return;
      }
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
    [demoFallbackEnabled, persistDemoCover, applyDemoLocalCover, toast, coverUploading, saveCoverFile]
  );

  // Cover editor modal
  const [coverEditorOpen, setCoverEditorOpen] = useState(false);

  const handleEditorSave = useCallback(
    async (file: File) => {
      if (demoFallbackEnabled) {
        const ok = await applyDemoLocalCover(file);
        setCoverEditorOpen(false);
        if (ok) toast.success("Cover updated.");
        return;
      }
      await saveCoverFile(file);
      setCoverEditorOpen(false);
    },
    [demoFallbackEnabled, applyDemoLocalCover, saveCoverFile, toast]
  );

  return {
    coverInputRef,
    coverUploading,
    coverError,
    coverPreviewUrl,
    displayCoverUrl,
    demoCoverUrl,
    coverDropActive,
    setCoverDropActive,
    coverAIPrompt,
    setCoverAIPrompt,
    coverAIStyle,
    setCoverAIStyle,
    coverAIGeneratedUrls,
    coverAIGeneratedSource,
    coverAIPhase,
    coverAIGenerating,
    coverAIError,
    setCoverAIError,
    coverCropSrc,
    setCoverCropSrc,
    coverAIPreviewUrl,
    setCoverAIPreviewUrl,
    coverAITemplate,
    setCoverAITemplate,
    coverAITemplateFields,
    setCoverAITemplateFields,
    coverEditorOpen,
    setCoverEditorOpen,
    handleRemoveCover,
    handleDemoRemoveCover,
    handleCropSave,
    handleCoverChange,
    handleCoverDrop,
    handleCoverAIGenerate,
    handleCoverSetFromGenerated,
    handleEditorSave,
  };
}
