"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import TranslationStatusBadge, { type TranslationStatus } from "./TranslationStatusBadge";
import { useDocumentVisible } from "@/hooks/useDocumentVisible";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "sv", label: "Svenska" },
  { code: "es", label: "Espa\u00f1ol" },
  { code: "fr", label: "Fran\u00e7ais" },
  { code: "de", label: "Deutsch" },
  { code: "it", label: "Italiano" },
  { code: "pt", label: "Portugu\u00eas" },
  { code: "nl", label: "Nederlands" },
  { code: "no", label: "Norsk" },
  { code: "da", label: "Dansk" },
  { code: "fi", label: "Suomi" },
  { code: "pl", label: "Polski" },
];

type TranslationEntry = {
  language: string;
  status: string;
  progress: number;
};

function mapStatus(raw: string): TranslationStatus {
  if (raw === "done") return "completed";
  if (raw === "translating") return "translating";
  if (raw === "failed") return "failed";
  return "pending";
}

export default function TranslationPanel({ bookId }: { bookId: string }) {
  const isVisible = useDocumentVisible();
  const [targetLanguage, setTargetLanguage] = useState("en");
  const [translations, setTranslations] = useState<TranslationEntry[]>([]);
  const [starting, setStarting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fetchAbortRef = useRef<AbortController | null>(null);

  const fetchStatus = useCallback(async () => {
    fetchAbortRef.current?.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;
    try {
      const res = await fetch(`/api/books/${bookId}/translation-status`, {
        signal: controller.signal,
      });
      if (!res.ok) return;
      const data = await res.json();
      setTranslations(data.translations ?? []);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      // silent
    } finally {
      if (fetchAbortRef.current === controller) {
        fetchAbortRef.current = null;
      }
    }
  }, [bookId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Auto-poll when any translation is in progress
  const hasInProgress = translations.some((t) => t.status === "translating");

  useEffect(() => {
    if (!isVisible) return;
    if (hasInProgress) {
      pollRef.current = setInterval(fetchStatus, 10_000);
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      fetchAbortRef.current?.abort();
      fetchAbortRef.current = null;
    };
  }, [hasInProgress, fetchStatus, isVisible]);

  const handleStartTranslation = async () => {
    setStarting(true);
    setMessage(null);

    try {
      const res = await fetch(`/api/books/${bookId}/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetLanguage }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setMessage(data?.error ?? "Kunde inte starta översättning");
        return;
      }

      setMessage("Översättning startad!");
      await fetchStatus();
    } catch {
      setMessage("Nätverksfel vid start av översättning");
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200/50 p-5 dark:border-white/10">
      <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white">
        Översättningar
      </h3>
      <p className="mt-1 text-[12px] text-slate-500 dark:text-white/50">
        Starta en översättning till ett nytt språk.
      </p>

      <div className="mt-4 flex items-end gap-3">
        <div className="flex-1">
          <label
            htmlFor={`translate-lang-${bookId}`}
            className="mb-1 block text-[12px] font-medium text-slate-600 dark:text-white/60"
          >
            Målspråk
          </label>
          <select
            id={`translate-lang-${bookId}`}
            value={targetLanguage}
            onChange={(e) => setTargetLanguage(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-900 focus:border-[#907AFF]/60 focus:outline-none focus:ring-1 focus:ring-[#907AFF]/30 dark:border-white/15 dark:bg-white/5 dark:text-white"
          >
            {LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={handleStartTranslation}
          disabled={starting}
          className="rounded-xl bg-[#907AFF] px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-[#8069EE] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {starting ? "Startar\u2026" : "Starta \u00f6vers\u00e4ttning"}
        </button>
      </div>

      {message && (
        <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-white/70">
          {message}
        </p>
      )}

      {translations.length > 0 && (
        <div className="mt-5 space-y-2">
          <p className="text-[12px] font-medium uppercase tracking-[0.15em] text-slate-500 dark:text-white/50">
            Status
          </p>
          {translations.map((t) => (
            <div
              key={t.language}
              className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-2 dark:border-white/5 dark:bg-white/[0.02]"
            >
              <span className="text-[13px] text-slate-800 dark:text-white/80">
                {LANGUAGES.find((l) => l.code === t.language)?.label ?? t.language}
              </span>
              <div className="flex items-center gap-2">
                {t.status === "translating" && (
                  <span className="text-[11px] text-slate-500 dark:text-white/50">
                    {t.progress}%
                  </span>
                )}
                <TranslationStatusBadge status={mapStatus(t.status)} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
