"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ImportRetryState } from "@/components/books/JobStatusBanner";
import { useToastHelpers } from "@/components/ui/toast";
import { resolveErrorMessage } from "@/lib/error-messages";
import { getLanguageLabel, normalizeLanguage } from "@/lib/languages";
import type { UnifiedJob } from "@/hooks/useBookJobs";
import type { useAudiobook } from "./useAudiobook";
import type { useTranslation } from "./useTranslation";

interface UseJobRetryOptions {
  bookId: string;
  activeVersionId: string | undefined;
  activeChapterId?: string | null;
  audiobook: Pick<ReturnType<typeof useAudiobook>, "handleGenerateAudiobook">;
  translation: Pick<
    ReturnType<typeof useTranslation>,
    | "checkTranslationQueueHealth"
    | "translateTargetLanguage"
    | "setTranslateTargetLanguage"
    | "setLastRequestedTargetLanguage"
    | "setTranslateMessage"
    | "startTranslationPoll"
  >;
  refetchBookJob: () => Promise<void>;
}

export function useJobRetry({
  bookId,
  activeVersionId,
  activeChapterId,
  audiobook,
  translation,
  refetchBookJob,
}: UseJobRetryOptions) {
  const toast = useToastHelpers();
  const [importRetry, setImportRetry] = useState<ImportRetryState | null>(null);
  const attemptedImports = useRef(new Set<string>());
  const importRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    // Navigation cannot cancel an enqueue already accepted by the server.
    // Keep an uncertain attempt blocked, and ignore its late response.
    setImportRetry((previous) => previous?.status === "retrying"
      ? { ...previous, status: "blocked", message: `Import retry status is unknown. Refresh status before retrying. Support reference: ${previous.jobId}` }
      : previous);
    return () => { importRequest.current?.abort(); };
  }, [bookId, activeVersionId, activeChapterId]);

  const handleJobRetry = useCallback(
    async (job: UnifiedJob) => {
      if (job.kind === "audiobook") {
        audiobook.handleGenerateAudiobook();
        return;
      }

      if (job.kind === "translation") {
        if (!activeVersionId) {
          toast.error("No active source version found.");
          return;
        }
        const queueHealthy = await translation.checkTranslationQueueHealth();
        if (!queueHealthy) {
          toast.error("Translation service is temporarily unavailable. Try again soon.");
          return;
        }
        const meta = job.meta as Record<string, unknown>;
        const targetLanguage = normalizeLanguage(
          (job.language ?? (meta.languageCode as string) ?? translation.translateTargetLanguage) as string
        );
        const targetVersionId =
          job.bookVersionId ??
          (typeof meta.bookVersionId === "string" && meta.bookVersionId.trim().length > 0
            ? meta.bookVersionId
            : null);
        try {
          const res = await fetch(`/api/books/${bookId}/translate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              targetLanguage,
              sourceVersionId: activeVersionId,
              targetVersionId,
              overwrite: true,
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || data?.ok === false) {
            toast.error(resolveErrorMessage(data?.error));
            return;
          }
          translation.setTranslateTargetLanguage(targetLanguage);
          translation.setLastRequestedTargetLanguage(targetLanguage);
          translation.setTranslateMessage(`Translation restarted (${getLanguageLabel(targetLanguage)}).`);
          translation.startTranslationPoll();
          await refetchBookJob();
          toast.success("Translation queued again.");
        } catch {
          toast.error("Could not retry translation.");
        }
        return;
      }

      if (job.kind === "import") {
        const attemptKey = `${job.id}:${job.finishedAt ?? "unknown"}`;
        if (attemptedImports.current.has(attemptKey) || importRequest.current) return;
        attemptedImports.current.add(attemptKey);
        const controller = new AbortController();
        importRequest.current = controller;
        const attempt = { jobId: job.id, failedAt: job.finishedAt };
        setImportRetry({ ...attempt, status: "retrying" });
        const uncertainMessage = `Import retry status is unknown. Refresh status before retrying. Support reference: ${job.id}`;
        const showError = (message: string) => {
          setImportRetry({ ...attempt, status: "blocked", message });
          toast.error(message);
        };
        try {
          const res = await fetch(`/api/books/imports/${job.id}`, { method: "POST", signal: controller.signal });
          const data = await res.json().catch(() => ({}));
          if (controller.signal.aborted) return;
          // The existing API also returns ok:true when enqueueing failed.
          // Only its explicit queue acknowledgement confirms a retry.
          if (res.ok && data?.ok === true && data?.id === job.id && data?.message === "Import re-queued.") {
            setImportRetry({ ...attempt, status: "queued" });
            toast.success("Import re-queued.");
            // A failed status read does not undo the acknowledged enqueue.
            await refetchBookJob().catch(() => {});
          } else {
            const message = data?.error === "IMPORT_RECOVERY_CHECKPOINT_UNAVAILABLE"
              ? `${resolveErrorMessage(data.error)} Support reference: ${job.id}`
              : res.ok ? uncertainMessage
              : `${resolveErrorMessage(data?.error)} Refresh status before retrying. Support reference: ${job.id}`;
            showError(message);
          }
        } catch {
          if (!controller.signal.aborted) showError(uncertainMessage);
        } finally {
          if (importRequest.current === controller) importRequest.current = null;
        }
      }
    },
    [activeVersionId, audiobook, bookId, refetchBookJob, toast, translation]
  );

  return { handleJobRetry, importRetry };
}
