"use client";

import { useCallback, useMemo, useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { resolveErrorMessage } from "@/lib/error-messages";
import { isJobActiveStatus } from "@/lib/job-status";
import type { UnifiedJob } from "@/hooks/useBookJobs";
import {
  IMPORT_ALLOWED_EXT,
  IMPORT_MAX_BYTES,
  IMPORT_MAX_MB,
} from "../BookEditorView.helpers";

type ImportManusSectionProps = {
  bookId: string;
  bookVersionId: string | null;
  refetchJobs: () => Promise<void>;
  importJobs: UnifiedJob[];
};

export default function ImportManusSection({
  bookId,
  bookVersionId,
  refetchJobs,
  importJobs,
}: ImportManusSectionProps) {
  const [overwrite, setOverwrite] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [repairing, setRepairing] = useState(false);
  const [repairMessage, setRepairMessage] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{
    chaptersCreated?: number;
    titleSet?: boolean;
    warnings?: string[];
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const visibleImportJobs = useMemo(() => {
    if (importJobs.length === 0) return [];
    const active = importJobs.filter((job) => isJobActiveStatus(job.status));
    if (active.length > 0) return active;
    return [importJobs[0]];
  }, [importJobs]);

  const handleFile = useCallback((file: File | null) => {
    setError(null);
    setRepairMessage(null);
    setLastResult(null);
    if (!file) {
      setSelectedFile(null);
      return;
    }
    const ext = "." + (file.name.split(".").pop() ?? "").toLowerCase();
    if (!IMPORT_ALLOWED_EXT.includes(ext)) {
      setError(`Supported file types: ${IMPORT_ALLOWED_EXT.join(", ")}.`);
      setSelectedFile(null);
      return;
    }
    if (file.size > IMPORT_MAX_BYTES) {
      setError(`Max file size is ${IMPORT_MAX_MB} MB.`);
      setSelectedFile(null);
      return;
    }
    setSelectedFile(file);
  }, []);

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      handleFile(event.dataTransfer.files?.[0] ?? null);
    },
    [handleFile]
  );

  const startImport = useCallback(async () => {
    if (!selectedFile || uploading) return;
    setError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", selectedFile);
      form.append("bookId", bookId);
      if (bookVersionId) form.append("bookVersionId", bookVersionId);
      form.append("overwrite", String(overwrite));
      const res = await fetch("/api/books/import", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(resolveErrorMessage(data?.error as string));
        return;
      }
      setLastResult({ chaptersCreated: undefined, titleSet: undefined });
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await refetchJobs();
    } catch {
      setError("Could not start import. Try again.");
    } finally {
      setUploading(false);
    }
  }, [bookId, bookVersionId, overwrite, refetchJobs, selectedFile, uploading]);

  const runChapterRepair = useCallback(async () => {
    if (repairing) return;
    if (!bookVersionId) {
      setRepairMessage("No active version found.");
      return;
    }

    setError(null);
    setRepairMessage(null);
    setRepairing(true);

    try {
      const res = await fetch(`/api/books/${bookId}/chapters/repair`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bookVersionId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRepairMessage(resolveErrorMessage(data?.error as string));
        return;
      }

      const updatedCount =
        typeof data?.updatedCount === "number" ? Number(data.updatedCount) : 0;
      if (updatedCount > 0) {
        setRepairMessage("Done: repaired  chapter headings.");
      } else {
        setRepairMessage("Nothing to repair in this version.");
      }
      router.refresh();
    } catch {
      setRepairMessage("Could not repair chapter headings. Try again.");
    } finally {
      setRepairing(false);
    }
  }, [bookId, bookVersionId, repairing, router]);

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
        Import manuscript
      </h2>
      <p className="text-sm text-slate-600 dark:text-white/60">
        Upload a file to import chapters into this book. Supported formats:
        EPUB, DOCX, HTML, TXT, PDF. Max {IMPORT_MAX_MB} MB.
      </p>

      <div className="rounded-2xl border border-black/[0.05] bg-white/60 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.02)] backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02] dark:shadow-none space-y-4">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
          Import behavior
        </h3>
        <div className="flex items-center gap-3">
          <input
            type="radio"
            id="import-new-version"
            name="import-mode"
            checked={!overwrite}
            onChange={() => setOverwrite(false)}
            aria-label="Import as new version"
            className="h-4 w-4 accent-[#907AFF]"
          />
          <label
            htmlFor="import-new-version"
            className="text-sm text-slate-700 dark:text-white/80"
          >
            Import as new version
          </label>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="radio"
            id="import-overwrite"
            name="import-mode"
            checked={overwrite}
            onChange={() => setOverwrite(true)}
            aria-label="Overwrite draft"
            className="h-4 w-4 accent-[#907AFF]"
          />
          <label
            htmlFor="import-overwrite"
            className="text-sm text-slate-700 dark:text-white/80"
          >
            Overwrite draft
          </label>
        </div>
        {overwrite && (
          <div
            className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
            role="alert"
          >
            Import can overwrite existing chapters in this version. Use
            &quot;Import as new version&quot; if you want to keep them.
          </div>
        )}
      </div>

      <div
        className={`rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${
          selectedFile
            ? "border-[#907AFF]/40 bg-[#907AFF]/5 dark:bg-[#907AFF]/10"
            : "border-black/[0.06] dark:border-white/[0.06] bg-white/50 dark:bg-white/[0.02]"
        }`}
        onDragOver={(event) => event.preventDefault()}
        onDrop={onDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={IMPORT_ALLOWED_EXT.join(",")}
          className="hidden"
          aria-label="Choose file to import"
          onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
          disabled={uploading}
        />
        <p className="text-sm text-slate-600 dark:text-white/60 mb-2">
          Drag and drop a file here, or click to choose.{" "}
          {IMPORT_ALLOWED_EXT.join(", ")} - max {IMPORT_MAX_MB} MB.
        </p>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="rounded-xl border border-black/[0.08] bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white dark:hover:bg-white/[0.06]"
        >
          Choose file
        </button>
        {selectedFile && (
          <p className="mt-3 text-sm font-medium text-slate-900 dark:text-white">
            Selected file: {selectedFile.name}
          </p>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={startImport}
        disabled={!selectedFile || uploading}
        aria-label="Start import"
        className="rounded-xl bg-slate-900 px-4 py-2.5 text-[13px] font-semibold text-white shadow-sm transition-all hover:bg-slate-800 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed dark:bg-white dark:text-slate-900"
      >
        {uploading ? "Starting import..." : "Start import"}
      </button>

      <div className="rounded-xl border border-black/[0.06] bg-slate-50/50 px-4 py-3 dark:border-white/[0.06] dark:bg-white/5">
        <p className="text-sm font-medium text-slate-900 dark:text-white">
          Repair existing import
        </p>
        <p className="mt-1 text-xs text-slate-600 dark:text-white/60">
          Run this if chapter headings are already incorrect (for example
          duplicated or out of order).
        </p>
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={runChapterRepair}
            disabled={!bookVersionId || repairing || uploading}
            aria-label="Repair chapter headings"
            className="rounded-xl border border-black/[0.08] bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white dark:hover:bg-white/[0.06]"
          >
            {repairing ? "Repairing..." : "Repair chapter headings"}
          </button>
          {repairMessage && (
            <p className="text-sm text-slate-700 dark:text-white/80">
              {repairMessage}
            </p>
          )}
        </div>
      </div>

      {lastResult && !importJobs.some((job) => isJobActiveStatus(job.status)) && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-800 dark:bg-emerald-950/30">
          <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
            Import has started. Follow status in the banner above.
          </p>
          {lastResult.chaptersCreated != null && (
            <p className="text-sm text-emerald-700 dark:text-emerald-300">
              Chapter count: {lastResult.chaptersCreated}
            </p>
          )}
        </div>
      )}

      {visibleImportJobs.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            Import status
          </h3>
          {visibleImportJobs.map((job) => {
            const meta = (job.meta ?? {}) as Record<string, unknown>;
            const chaptersCreated =
              typeof meta.chaptersCreated === "number"
                ? meta.chaptersCreated
                : null;
            const frontMatterCount =
              typeof meta.frontMatterCount === "number"
                ? meta.frontMatterCount
                : null;
            const titleSet = meta.titleSet === true;
            const resolvedTitle =
              typeof meta.bookTitle === "string" ? meta.bookTitle : null;
            const warnings = Array.isArray(meta.warnings)
              ? meta.warnings.filter(
                  (value): value is string => typeof value === "string"
                )
              : [];

            return (
              <div
                key={job.id}
                className={`rounded-xl border px-4 py-3 text-sm ${
                  job.status === "failed"
                    ? "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30"
                    : job.status === "completed"
                      ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30"
                      : "border-black/[0.06] bg-slate-50/50 dark:border-white/[0.06] dark:bg-white/5"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-900 dark:text-white">
                    {job.status === "pending" && "Queued..."}
                    {job.status === "running" && "Importing... "}
                    {job.status === "completed" && "Import succeeded"}
                    {job.status === "failed" && "Import failed"}
                  </span>
                  {(job.status === "pending" || job.status === "running") && (
                    <span className="text-xs text-slate-500 dark:text-white/50">
                      {job.progress > 0 ? `${job.progress}%` : "Queued"}
                    </span>
                  )}
                </div>
                {job.status === "running" && job.progress > 0 && (
                  <div className="mt-2 h-1.5 w-full rounded-full bg-slate-200 dark:bg-white/10">
                    <div
                      className="h-1.5 rounded-full bg-[#907AFF] transition-all"
                      style={{ width: `${Math.min(100, job.progress)}%` }}
                    />
                  </div>
                )}
                {job.error && (
                  <p className="mt-1 text-red-700 dark:text-red-300">
                    {job.error}
                  </p>
                )}
                {job.status === "completed" && chaptersCreated != null && (
                  <p className="mt-1 text-emerald-700 dark:text-emerald-300">
                    {chaptersCreated} chapters imported
                  </p>
                )}
                {job.status === "completed" &&
                  frontMatterCount != null &&
                  frontMatterCount > 0 && (
                    <p className="mt-1 text-emerald-700 dark:text-emerald-300">
                      {frontMatterCount} intro sections (foreword/contents) were
                      split automatically
                    </p>
                  )}
                {job.status === "completed" && titleSet && resolvedTitle && (
                  <p className="mt-1 text-emerald-700 dark:text-emerald-300">
                    Title set automatically: {resolvedTitle}
                  </p>
                )}
                {warnings.length > 0 && (
                  <p className="mt-1 text-xs text-slate-500 dark:text-white/50">
                    Notes: {warnings.join(", ")}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
