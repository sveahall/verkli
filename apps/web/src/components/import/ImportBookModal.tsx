"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { resolveErrorMessage } from "@/lib/error-messages";
import { isJobActiveStatus, normalizeJobStatus, type JobStatus } from "@/lib/job-status";
import { useDocumentVisible } from "@/hooks/useDocumentVisible";

const ALLOWED_EXT = [".epub", ".docx", ".html", ".htm", ".txt"];
const POLL_INTERVAL_MS = 2500;

const STATUS_LABELS: Record<string, string> = {
  pending: "Queued",
  running: "Running",
  completed: "Succeeded",
  failed: "Failed",
};

export type ImportItem = {
  id: string;
  file_name: string;
  status: JobStatus;
  progress: number;
  error: string | null;
  book_id: string | null;
  book_version_id?: string | null;
  created_at: string;
};

type ImportBookModalProps = {
  open: boolean;
  onClose: () => void;
  onImportComplete?: (bookId: string, versionId?: string | null) => void;
};

function toImportStatus(raw: unknown): JobStatus {
  return normalizeJobStatus(typeof raw === "string" ? raw : null);
}

export function ImportBookModal({ open, onClose, onImportComplete }: ImportBookModalProps) {
  const isVisible = useDocumentVisible();
  const [importsList, setImportsList] = useState<ImportItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [redisHint, setRedisHint] = useState(false);
  const [pendingImportIds, setPendingImportIds] = useState<string[]>([]);
  const [openedAtMs, setOpenedAtMs] = useState<number | null>(null);
  const fetchAbortRef = useRef<AbortController | null>(null);

  const parseTimestamp = (value: string | null | undefined): number => {
    if (!value) return 0;
    const ts = Date.parse(value);
    return Number.isFinite(ts) ? ts : 0;
  };

  const fetchImports = useCallback(async () => {
    fetchAbortRef.current?.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;
    try {
      const res = await fetch("/api/books/imports?limit=20", {
        signal: controller.signal,
      });
      if (res.ok) {
        const data = await res.json();
        const normalized = ((data.imports as ImportItem[] | undefined) ?? []).map((item) => ({
          ...item,
          status: toImportStatus(item.status),
        }));
        setImportsList(normalized);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      setImportsList([]);
    } finally {
      if (fetchAbortRef.current === controller) {
        fetchAbortRef.current = null;
      }
    }
  }, []);

  useEffect(() => {
    if (!open) {
      fetchAbortRef.current?.abort();
      fetchAbortRef.current = null;
      setPendingImportIds([]);
      setOpenedAtMs(null);
      setImportsList([]);
      return;
    }

    setError(null);
    setSuccessMessage(null);
    setRedisHint(false);
    setPendingImportIds([]);
    setOpenedAtMs(Date.now());
    fetchImports();
  }, [open, fetchImports]);

  useEffect(() => {
    if (!open) return;
    if (!isVisible) return;
    const hasPending = importsList.some((i) => isJobActiveStatus(i.status));
    if (!hasPending) return;
    const t = setInterval(fetchImports, POLL_INTERVAL_MS);
    return () => {
      clearInterval(t);
      fetchAbortRef.current?.abort();
      fetchAbortRef.current = null;
    };
  }, [open, importsList, fetchImports, isVisible]);

  useEffect(() => {
    if (!open || !onImportComplete) return;
    if (pendingImportIds.length === 0) return;
    if (!openedAtMs) return;

    const completed = importsList.find(
      (item) =>
        pendingImportIds.includes(item.id) &&
        item.status === "completed" &&
        parseTimestamp(item.created_at) >= openedAtMs - 1_000 &&
        item.book_id
    );
    if (!completed) return;

    setPendingImportIds((prev) => prev.filter((id) => id !== completed.id));
    onImportComplete(completed.book_id!, completed.book_version_id ?? null);
  }, [open, importsList, onImportComplete, pendingImportIds, openedAtMs]);

  const handleFile = async (file: File) => {
    const ext = "." + (file.name.split(".").pop() ?? "").toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) {
      setError("File type is not supported. Use EPUB, DOCX, HTML, or TXT.");
      return;
    }
    // Client-side size check so a user on a slow connection doesn't upload
    // 200 MB before the server rejects it. The UI already promises "max
    // 50 MB" — enforce it before we start the upload.
    const MAX_BYTES = 50 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      setError("File is too large. Maximum size is 50 MB.");
      return;
    }
    setError(null);
    setSuccessMessage(null);
    setRedisHint(false);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/books/import", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(resolveErrorMessage(data?.error));
        return;
      }

      setSuccessMessage("Import started. Your file will be processed shortly.");
      const importId = data.id;
      if (importId) {
        setPendingImportIds((prev) => [...prev, importId]);
        setImportsList((prev) => [
          {
            id: importId,
            file_name: file.name,
            status: toImportStatus(data.status ?? "pending"),
            progress: data.progress ?? 0,
            error: null,
            book_id: null,
            book_version_id: null,
            created_at: new Date().toISOString(),
          },
          ...prev,
        ]);
      }

      const msg = (data.message ?? "").toLowerCase();
      if (
        msg.includes("redis") ||
        msg.includes("worker") ||
        msg.includes("start redis")
      ) {
        setRedisHint(true);
      }
    } catch (err) {
      // Previously a network failure reset `uploading` in `finally` but
      // left `error` null, so the spinner disappeared with no feedback.
      setError(
        err instanceof Error ? err.message : "Upload failed. Try again."
      );
    } finally {
      setUploading(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    e.target.value = "";
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-[560px] max-h-[90vh] mt-20 overflow-hidden rounded-3xl border border-black/10 dark:border-white/10 bg-white/[0.95] dark:bg-[#0a0a0f]/[0.95] backdrop-blur-xl flex flex-col">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-5 top-5 z-10 text-slate-500 dark:text-white/50 hover:text-slate-900 dark:hover:text-white"
          aria-label="Close"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="p-6 border-b border-black/10 dark:border-white/10">
          <h2 className="text-[22px] font-semibold text-slate-900 dark:text-white">Import book</h2>
          <p className="mt-1 text-[14px] text-slate-600 dark:text-white/50">
            Upload an existing book file to import chapters automatically.
          </p>
          <p className="mt-0.5 text-[13px] text-slate-500 dark:text-white/40">
            Allowed formats: .epub, .docx, .html, .txt - max 50 MB
          </p>
        </div>

        {error && (
          <div className="mx-6 mt-4 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-[14px] text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {successMessage && (
          <div className="mx-6 mt-4 rounded-xl border border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-950/30 px-4 py-3 text-[14px] text-green-700 dark:text-green-300">
            {successMessage}
          </div>
        )}

        {redisHint && (
          <div className="mx-6 mt-4 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-[14px] text-amber-800 dark:text-amber-200">
            Your file is queued. Processing may take a while. If nothing happens, try again later.
          </div>
        )}

        <div
          className={`mx-6 mt-4 rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${
            dragOver ? "border-[#907AFF]/50 bg-[#907AFF]/5" : "border-black/20 dark:border-white/20 bg-black/[0.02] dark:bg-white/[0.02]"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <input
            type="file"
            accept=".epub,.docx,.html,.htm,.txt"
            className="hidden"
            id="import-file-input"
            onChange={onFileInputChange}
            disabled={uploading}
          />
          <label htmlFor="import-file-input" className="cursor-pointer">
            {uploading ? (
              <span className="flex items-center justify-center gap-2 text-[14px] text-slate-600 dark:text-white/50">
                <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Uploading...
              </span>
            ) : (
              <>
                <svg
                  className="mx-auto h-10 w-10 text-slate-400 dark:text-white/40"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
                <p className="mt-2 text-[14px] font-medium text-slate-700 dark:text-white/70">
                  Drag and drop a file here, or click to upload
                </p>
              </>
            )}
          </label>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <h3 className="mb-3 text-[14px] font-semibold text-slate-900 dark:text-white">Import status</h3>
          {importsList.length === 0 ? (
            <p className="text-[13px] text-slate-500 dark:text-white/40">No imports yet.</p>
          ) : (
            <ul className="space-y-2">
              {importsList.map((imp, i) => (
                <li
                  key={`${imp.id}-${i}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium text-slate-900 dark:text-white">
                      {imp.file_name}
                    </p>
                    <p className="mt-0.5 text-[12px] text-slate-500 dark:text-white/50">
                      {imp.status === "completed" && imp.book_id ? (
                        <Link
                          href={`/author/books/${imp.book_id}`}
                          className="text-[#907AFF] hover:underline"
                        >
                          Open book
                        </Link>
                      ) : imp.status === "failed" && imp.error ? (
                        <span className="text-red-500">{imp.error}</span>
                      ) : imp.status === "running" || imp.status === "pending" ? (
                        <span>
                          {STATUS_LABELS[imp.status] ?? imp.status}
                          {imp.progress > 0 ? ` ${imp.progress}%` : ""}
                        </span>
                      ) : (
                        STATUS_LABELS[imp.status] ?? imp.status
                      )}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                      imp.status === "completed"
                        ? "bg-green-500/20 text-green-700 dark:text-green-400"
                        : imp.status === "failed"
                          ? "bg-red-500/20 text-red-700 dark:text-red-400"
                          : "bg-slate-200/80 dark:bg-white/10 text-slate-600 dark:text-white/60"
                    }`}
                  >
                    {STATUS_LABELS[imp.status] ?? imp.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
