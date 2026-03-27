"use client";

import { useCallback } from "react";
import { useToastHelpers } from "@/components/ui/toast";
import { resolveErrorMessage } from "@/lib/error-messages";
import { getLanguageLabel, normalizeLanguage } from "@/lib/languages";
import type { UnifiedJob } from "@/hooks/useBookJobs";
import type { useAudiobook } from "./useAudiobook";
import type { useTranslation } from "./useTranslation";

interface UseJobRetryOptions {
  bookId: string;
  activeVersionId: string | undefined;
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
  audiobook,
  translation,
  refetchBookJob,
}: UseJobRetryOptions) {
  const toast = useToastHelpers();

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
        try {
          const res = await fetch(`/api/books/imports/${job.id}`, { method: "POST" });
          const data = await res.json().catch(() => ({}));
          if (res.ok) {
            await refetchBookJob();
            toast.success(data?.message ?? "Import re-queued.");
          } else {
            toast.error(resolveErrorMessage(data?.error));
          }
        } catch {
          toast.error("Could not retry import.");
        }
      }
    },
    [activeVersionId, audiobook, bookId, refetchBookJob, toast, translation]
  );

  return { handleJobRetry };
}
