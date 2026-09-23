"use client";

import { normalizeJobStatus, isJobActiveStatus } from "@/lib/job-status";
import type { LatestAudiobookAsset } from "../BookEditorView.types";
import type { AudiobookProgress } from "./useAudiobook";

// ── Job status computation ────────────────────────────────────────────────────

const STALE_ACTIVE_MS = 30 * 60 * 1000; // 30 min

interface AudiobookJobInfo {
  createdAt?: string | null;
  status: string;
  meta?: unknown;
  error?: string | null;
}

export function computeAudiobookJobFlags(job: AudiobookJobInfo | null) {
  const audiobookJobStatus = job ? normalizeJobStatus(job.status) : null;

  const isAudiobookJobStale = (() => {
    if (!job || !isJobActiveStatus(audiobookJobStatus)) return false;
    const created = job.createdAt ? new Date(job.createdAt).getTime() : 0;
    if (created <= 0) return false;
    if (Date.now() - created <= STALE_ACTIVE_MS) return false;
    const meta = (job.meta ?? {}) as Record<string, unknown>;
    const cs = typeof meta.controlState === "string" ? meta.controlState : null;
    if (cs === "paused" || cs === "pause_requested" || cs === "cancel_requested") return false;
    if (meta.cancelRequested === true) return false;
    return true;
  })();

  const isAudiobookJobActive =
    !isAudiobookJobStale &&
    (audiobookJobStatus === "running" || audiobookJobStatus === "pending");

  const isAudiobookJobFailed = normalizeJobStatus(job?.status) === "failed";

  return { audiobookJobStatus, isAudiobookJobStale, isAudiobookJobActive, isAudiobookJobFailed };
}

// ── Audiobook meta extraction ─────────────────────────────────────────────────

export function computeAudiobookMeta(
  job: AudiobookJobInfo | null,
  latestAudiobookAsset: LatestAudiobookAsset
) {
  const meta = (job?.meta ?? {}) as Record<string, unknown>;

  const latestAudiobookScope =
    typeof meta.scope === "string" ? meta.scope : "book";
  const latestAudiobookControlState =
    typeof meta.controlState === "string" ? meta.controlState : null;
  const latestAudiobookPauseRequested = meta.pauseRequested === true;
  const latestAudiobookCancelRequested = meta.cancelRequested === true;

  const latestAudiobookManifestUrl =
    typeof meta.manifestUrl === "string" && meta.manifestUrl.trim().length > 0
      ? meta.manifestUrl.trim()
      : null;

  const latestAudiobookAudioUrl =
    typeof meta.audioUrl === "string" && meta.audioUrl.trim().length > 0
      ? meta.audioUrl.trim()
      : null;

  const latestAudiobookGeneratedChapterAudioUrl =
    typeof meta.generatedChapterAudioUrl === "string" &&
    meta.generatedChapterAudioUrl.trim().length > 0
      ? meta.generatedChapterAudioUrl.trim()
      : null;

  const latestAudiobookAssetAudioUrl =
    typeof latestAudiobookAsset?.audioSignedUrl === "string" &&
    latestAudiobookAsset.audioSignedUrl.trim().length > 0
      ? latestAudiobookAsset.audioSignedUrl.trim()
      : null;

  const fallbackGeneratedAudiobookUrl =
    latestAudiobookGeneratedChapterAudioUrl ?? latestAudiobookAudioUrl ?? latestAudiobookAssetAudioUrl;

  const latestAudiobookChapterIds =
    Array.isArray(meta.chapterIds) && meta.chapterIds.every((id: unknown) => typeof id === "string")
      ? (meta.chapterIds as string[])
      : [];

  const hasCompletedAudiobookJob =
    normalizeJobStatus(job?.status) === "completed" && latestAudiobookScope !== "chapter";
  const hasCompletedChapterAudiobookJob =
    normalizeJobStatus(job?.status) === "completed" && latestAudiobookScope === "chapter";
  const hasFailedAudiobookJob = normalizeJobStatus(job?.status) === "failed";
  const hasGeneratedAudiobookAsset = latestAudiobookAsset?.status === "generated";

  return {
    latestAudiobookMeta: meta,
    latestAudiobookScope,
    latestAudiobookControlState,
    latestAudiobookPauseRequested,
    latestAudiobookCancelRequested,
    latestAudiobookManifestUrl,
    latestAudiobookAudioUrl,
    latestAudiobookGeneratedChapterAudioUrl,
    latestAudiobookAssetAudioUrl,
    fallbackGeneratedAudiobookUrl,
    latestAudiobookChapterIds,
    hasCompletedAudiobookJob,
    hasCompletedChapterAudiobookJob,
    hasFailedAudiobookJob,
    hasGeneratedAudiobookAsset,
  };
}

// ── Status UI computation ─────────────────────────────────────────────────────

interface AudiobookStatusUiOptions {
  audiobookFeatureEnabled: boolean;
  isAudiobookActive: boolean;
  isAudiobookCancelRequested: boolean;
  isAudiobookPaused: boolean;
  latestAudiobookPauseRequested: boolean;
  latestAudiobookControlState: string | null;
  audiobookJobStatus: string | null;
  hasGeneratedAudiobookAsset: boolean;
  hasCompletedAudiobookJob: boolean;
  hasCompletedChapterAudiobookJob: boolean;
  isAudiobookCancelled: boolean;
  hasFailedAudiobookJob: boolean;
  latestAudiobookJob: AudiobookJobInfo | null;
  bookAudiobookStatus: string | null;
}

export function computeAudiobookStatusUi({
  audiobookFeatureEnabled,
  isAudiobookActive,
  isAudiobookCancelRequested,
  isAudiobookPaused,
  latestAudiobookPauseRequested,
  latestAudiobookControlState,
  audiobookJobStatus,
  hasGeneratedAudiobookAsset,
  hasCompletedAudiobookJob,
  hasCompletedChapterAudiobookJob,
  isAudiobookCancelled,
  hasFailedAudiobookJob,
  latestAudiobookJob,
  bookAudiobookStatus,
}: AudiobookStatusUiOptions) {
  if (!audiobookFeatureEnabled) return "disabled";
  if (isAudiobookActive) {
    if (isAudiobookCancelRequested) return "cancel_requested";
    if (isAudiobookPaused || latestAudiobookPauseRequested) {
      return latestAudiobookControlState === "pause_requested" || latestAudiobookPauseRequested
        ? "pause_requested"
        : "paused";
    }
    if (audiobookJobStatus === "pending") return "queued";
    return "generating";
  }
  if (hasGeneratedAudiobookAsset || hasCompletedAudiobookJob || hasCompletedChapterAudiobookJob)
    return "published";
  if (isAudiobookCancelled) return "cancelled";
  if (hasFailedAudiobookJob) return "failed";
  if (!latestAudiobookJob) return "idle";
  return bookAudiobookStatus ?? "idle";
}

// ── Server progress extraction ─────────────────────────────────────────────────

export function computeServerAudiobookProgress(
  job: AudiobookJobInfo | null
): AudiobookProgress | null {
  if (!job || !isJobActiveStatus(job.status)) return null;
  const meta = job.meta as Record<string, unknown>;
  return {
    totalChapters: (meta.totalChapters as number) ?? 0,
    completedChapters: (meta.completedChapters as number) ?? 0,
    currentChapterTitle: (meta.currentChapterTitle as string) ?? null,
    estimatedSecondsRemaining: (meta.estimatedSecondsRemaining as number) ?? null,
  };
}
