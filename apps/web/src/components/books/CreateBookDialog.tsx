"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LANGUAGE_OPTIONS, type SupportedLanguage } from "@/lib/languages";
import { resolveErrorMessage } from "@/lib/error-messages";
import { ImportBookModal } from "@/components/import/ImportBookModal";
import { Dialog, DialogTitle } from "@/components/ui/dialog";

type Mode = "choice" | "write" | "import";

type CreateBookDialogProps = {
  open: boolean;
  onClose: () => void;
  initialMode?: Mode;
  onCreated?: (bookId: string, versionId?: string | null, language?: SupportedLanguage) => void;
  onImported?: (bookId: string, versionId?: string | null) => void;
};

export default function CreateBookDialog({
  open,
  onClose,
  initialMode = "write",
  onCreated,
  onImported,
}: CreateBookDialogProps) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [language, setLanguage] = useState<SupportedLanguage>("en");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const fieldId = useId();

  useEffect(() => {
    if (!open) {
      setImportOpen(false);
      return;
    }
    setMode(initialMode);
    setTitle("");
    setDescription("");
    setLanguage("en");
    setError(null);
    setCreating(false);
    setImportOpen(initialMode === "import");
  }, [open, initialMode]);

  const canShowDialog = open && !importOpen;

  const handleCreated = (bookId: string | undefined, versionId?: string | null, lang?: SupportedLanguage) => {
    if (!bookId) return;
    window.dispatchEvent(new CustomEvent("author-shell:refresh-books"));
    if (onCreated) {
      onCreated(bookId, versionId ?? null, lang);
      return;
    }
    router.push(`/author/books/${bookId}`);
  };

  const handleImportComplete = (bookId: string, versionId?: string | null) => {
    window.dispatchEvent(new CustomEvent("author-shell:refresh-books"));
    if (onImported) {
      onImported(bookId, versionId ?? null);
      return;
    }
    router.push(`/author/books/${bookId}`);
  };

  const handleCreate = async () => {
    if (creating) return;
    if (!title.trim()) {
      setError("Please add a title to continue.");
      titleInputRef.current?.focus();
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || "Untitled",
          description: description.trim() || undefined,
          language,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(resolveErrorMessage(data?.error));
        return;
      }
      // Support both flat { id } and wrapped { data: { id } } API shapes
      const bookId: string | undefined = data?.data?.id ?? data?.id;
      const versionId: string | null = data?.data?.versionId ?? data?.versionId ?? null;
      handleCreated(bookId, versionId, language);
      onClose();
    } catch {
      setError("Could not create book. Try again.");
    } finally {
      setCreating(false);
    }
  };

  const header = useMemo(() => {
    if (mode === "write") return "New book";
    if (mode === "import") return "Import book";
    return "New book";
  }, [mode]);

  return (
    <>
        <Dialog
          open={canShowDialog}
          onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}
          className="w-[min(92vw,600px)] rounded-3xl p-6 sm:p-8"
        >
            <button
              type="button"
              onClick={onClose}
              aria-label="Close new book"
              className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <DialogTitle className="mb-6 pr-10 text-[24px] font-normal">{header}</DialogTitle>

            {mode === "choice" && (
              <div className="grid gap-4 md:grid-cols-2">
                <button
                  onClick={() => setMode("write")}
                  className="group rounded-2xl border border-black/10 dark:border-border bg-black/[0.02] dark:bg-card p-6 text-left transition-all hover:border-[#907AFF]/30 hover:bg-black/[0.01] dark:hover:bg-accent"
                >
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#E29ED5]/20 to-[#FCC997]/20">
                    <svg className="h-6 w-6 text-[#E29ED5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                  </div>
                  <h3 className="mb-2 text-[18px] font-semibold text-foreground dark:text-foreground">Write a new book</h3>
                  <p className="text-[14px] text-muted-foreground dark:text-muted-foreground">Create a new book and start writing</p>
                </button>
                <button
                  onClick={() => {
                    setMode("import");
                    setImportOpen(true);
                  }}
                  className="group rounded-2xl border border-black/10 dark:border-border bg-black/[0.02] dark:bg-card p-6 text-left transition-all hover:border-[#907AFF]/30 hover:bg-black/[0.01] dark:hover:bg-accent"
                >
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#FCC997]/20 to-[#FEE9A3]/20">
                    <svg className="h-6 w-6 text-[#FCC997]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <h3 className="mb-2 text-[18px] font-semibold text-foreground dark:text-foreground">Import book</h3>
                  <p className="text-[14px] text-muted-foreground dark:text-muted-foreground">Upload an existing book file (epub, docx, html, txt)</p>
                </button>
              </div>
            )}

            {mode === "write" && (
              <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void handleCreate(); }}>
                <div>
                  <label htmlFor={`${fieldId}-title`} className="mb-2 block text-[14px] font-normal text-foreground dark:text-foreground">Title</label>
                  <input
                    ref={(input) => {
                      titleInputRef.current = input;
                      // React focuses before showModal(); the native attribute
                      // also lets the dialog choose this field when it opens.
                      if (input) input.autofocus = true;
                    }}
                    id={`${fieldId}-title`}
                    type="text"
                    value={title}
                    onChange={(e) => { setTitle(e.target.value); if (error) setError(null); }}
                    placeholder="Book title"
                    aria-invalid={Boolean(error && !title.trim())}
                    aria-describedby={error ? `${fieldId}-error` : undefined}
                    className={`w-full rounded-xl border bg-black/[0.02] dark:bg-card px-4 py-3 text-[16px] text-foreground dark:text-foreground placeholder-muted-foreground dark:placeholder-white/30 outline-none transition-all focus:bg-black/10 dark:focus:bg-card ${error ? "border-red-400 dark:border-red-500 focus:border-red-400" : "border-black/10 dark:border-border focus:border-[#907AFF]/50"}`}
                    autoFocus
                  />
                </div>
                <div>
                  <label htmlFor={`${fieldId}-description`} className="mb-2 block text-[14px] font-normal text-foreground dark:text-foreground">
                    Description
                    <span className="ml-1.5 text-[12px] font-normal text-muted-foreground dark:text-muted-foreground">(optional)</span>
                  </label>
                  <textarea
                    id={`${fieldId}-description`}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="A short description of your book"
                    rows={3}
                    className="w-full resize-none rounded-xl border border-black/10 dark:border-border bg-black/[0.02] dark:bg-card px-4 py-3 text-[16px] sm:text-[15px] text-foreground dark:text-foreground placeholder-muted-foreground dark:placeholder-white/30 outline-none transition-all focus:border-[#907AFF]/50 focus:bg-black/10 dark:focus:bg-card"
                  />
                </div>
                <div>
                  <label htmlFor={`${fieldId}-language`} className="mb-2 block text-[14px] font-normal text-foreground dark:text-foreground">Language</label>
                  <select
                    id={`${fieldId}-language`}
                    value={language}
                    onChange={(e) => setLanguage(e.target.value as SupportedLanguage)}
                    className="w-full rounded-xl border border-black/10 dark:border-border bg-black/[0.02] dark:bg-card px-4 py-3 text-[16px] text-foreground dark:text-foreground outline-none transition-all focus:border-[#907AFF]/50 focus:bg-black/10 dark:focus:bg-card"
                  >
                    {LANGUAGE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                {error && <p id={`${fieldId}-error`} role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creating}
                    className="btn-primary"
                  >
                    {creating ? "Creating..." : "Create book"}
                  </button>
                </div>
                <p className="text-center text-[13px] text-muted-foreground dark:text-muted-foreground">
                  or{" "}
                  <button
                    type="button"
                    onClick={() => { setMode("import"); setImportOpen(true); }}
                    className="underline underline-offset-2 transition-colors hover:text-muted-foreground dark:hover:text-muted-foreground"
                  >
                    import from file
                  </button>
                  {" "}(.epub, .docx, .txt)
                </p>
              </form>
            )}
        </Dialog>
      <ImportBookModal
        open={importOpen}
        onClose={() => {
          setImportOpen(false);
          onClose();
        }}
        onImportComplete={(bookId, versionId) => {
          handleImportComplete(bookId, versionId);
          setImportOpen(false);
          onClose();
        }}
      />
    </>
  );
}
