"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LANGUAGE_OPTIONS, type SupportedLanguage, normalizeLanguage } from "@/lib/languages";
import { resolveErrorMessage } from "@/lib/error-messages";
import { ImportBookModal } from "@/components/import/ImportBookModal";

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
  initialMode = "choice",
  onCreated,
  onImported,
}: CreateBookDialogProps) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [title, setTitle] = useState("");
  const [language, setLanguage] = useState<SupportedLanguage>("sv");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      setImportOpen(false);
      return;
    }
    setMode(initialMode);
    setTitle("");
    setLanguage("sv");
    setError(null);
    setCreating(false);
    setImportOpen(initialMode === "import");
  }, [open, initialMode]);

  const canShowDialog = open && !importOpen;

  const handleCreated = (bookId: string, versionId?: string | null, lang?: SupportedLanguage) => {
    if (onCreated) {
      onCreated(bookId, versionId ?? null, lang);
      return;
    }
    const langParam = lang ? `?lang=${normalizeLanguage(lang)}` : "";
    router.push(`/author/books/${bookId}${langParam}`);
  };

  const handleImportComplete = (bookId: string, versionId?: string | null) => {
    if (onImported) {
      onImported(bookId, versionId ?? null);
      return;
    }
    router.push(`/author/books/${bookId}`);
  };

  const handleCreate = async () => {
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || "Namnlös",
          language,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(resolveErrorMessage(data?.error));
        return;
      }
      handleCreated(data.id, data.versionId ?? null, language);
      onClose();
    } catch {
      setError("Kunde inte skapa boken. Försök igen.");
    } finally {
      setCreating(false);
    }
  };

  const header = useMemo(() => {
    if (mode === "write") return "Skriv ny bok";
    if (mode === "import") return "Importera bok";
    return "Lägg till bok";
  }, [mode]);

  if (!open && !importOpen) return null;

  return (
    <>
      {canShowDialog && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-[600px] rounded-3xl border border-black/10 dark:border-white/10 bg-white/95 dark:bg-[#0a0a0f]/95 p-8 backdrop-blur-xl">
            <button
              onClick={onClose}
              className="absolute right-6 top-6 text-slate-500 dark:text-white/50 transition-colors hover:text-slate-900 dark:hover:text-white"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <h2 className="mb-6 text-[24px] font-semibold text-slate-900 dark:text-white">{header}</h2>

            {mode === "choice" && (
              <div className="grid gap-4 md:grid-cols-2">
                <button
                  onClick={() => setMode("write")}
                  className="group rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] p-6 text-left transition-all hover:border-[#907AFF]/30 hover:bg-black/[0.01] dark:hover:bg-white/[0.04]"
                >
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#E29ED5]/20 to-[#FCC997]/20">
                    <svg className="h-6 w-6 text-[#E29ED5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                  </div>
                  <h3 className="mb-2 text-[18px] font-semibold text-slate-900 dark:text-white">Skriv ny bok</h3>
                  <p className="text-[14px] text-slate-600 dark:text-white/50">Skapa en ny bok och börja skriva</p>
                </button>
                <button
                  onClick={() => {
                    setMode("import");
                    setImportOpen(true);
                  }}
                  className="group rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] p-6 text-left transition-all hover:border-[#907AFF]/30 hover:bg-black/[0.01] dark:hover:bg-white/[0.04]"
                >
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#FCC997]/20 to-[#FEE9A3]/20">
                    <svg className="h-6 w-6 text-[#FCC997]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <h3 className="mb-2 text-[18px] font-semibold text-slate-900 dark:text-white">Importera bok</h3>
                  <p className="text-[14px] text-slate-600 dark:text-white/50">Ladda upp en befintlig bokfil (epub, docx, html, txt)</p>
                </button>
              </div>
            )}

            {mode === "write" && (
              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-[14px] font-medium text-slate-700 dark:text-white/70">Titel</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Bokens titel"
                    className="w-full rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.04] px-4 py-3 text-[16px] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-white/30 outline-none transition-all focus:border-[#907AFF]/50 focus:bg-black/10 dark:focus:bg-white/[0.06]"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="mb-2 block text-[14px] font-medium text-slate-700 dark:text-white/70">Språk</label>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value as SupportedLanguage)}
                    className="w-full rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.04] px-4 py-3 text-[16px] text-slate-900 dark:text-white outline-none transition-all focus:border-[#907AFF]/50 focus:bg-black/10 dark:focus:bg-white/[0.06]"
                  >
                    {LANGUAGE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setMode("choice")}
                    className="rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] px-6 py-2.5 text-[14px] font-medium text-slate-700 dark:text-white/70 transition-all hover:bg-black/10 dark:hover:bg-white/[0.04]"
                  >
                    Tillbaka
                  </button>
                  <button
                    onClick={handleCreate}
                    disabled={creating}
                    className="rounded-xl bg-[#907AFF] px-6 py-2.5 text-[14px] font-medium text-white transition-all hover:bg-[#8069EE] disabled:opacity-60"
                  >
                    {creating ? "Skapar…" : "Skapa bok"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

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
