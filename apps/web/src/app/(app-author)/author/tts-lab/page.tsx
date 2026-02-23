"use client";

import { useState, useCallback, useRef } from "react";
import Link from "next/link";
import {
  TTS_PREVIEW_VOICE_ALLOWLIST,
  TTS_PREVIEW_DEFAULT_VOICE,
} from "@/lib/tts/preview-voices";

const VOICE_OPTIONS = TTS_PREVIEW_VOICE_ALLOWLIST.map((id) => ({
  id,
  label: id === TTS_PREVIEW_DEFAULT_VOICE ? `${id} (default)` : id,
}));

type Status = "idle" | "queued" | "running" | "succeeded" | "failed";

export default function TtsLabPage() {
  const [text, setText] = useState("Hej! Detta är en test av Qwen TTS. Skriv din text här.");
  const [voiceId, setVoiceId] = useState<string>(TTS_PREVIEW_DEFAULT_VOICE);
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const pollStatus = useCallback(async () => {
    if (!jobId) return;
    try {
      const res = await fetch(`/api/tts/qwen/preview/status?jobId=${encodeURIComponent(jobId)}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error ?? "Kunde inte hämta status");
        stopPolling();
        return;
      }
      const data = (await res.json()) as {
        status: Status;
        progress?: number;
        audioUrl?: string | null;
        error?: string | null;
      };
      setStatus(data.status);
      setProgress(data.progress ?? 0);
      setError(data.error ?? null);
      if (data.audioUrl) {
        setAudioUrl(data.audioUrl);
        stopPolling();
      }
      if (data.status === "failed" || data.status === "succeeded") {
        stopPolling();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nätverksfel");
      stopPolling();
    }
  }, [jobId, stopPolling]);

  const handleGenerate = async () => {
    setError(null);
    setAudioUrl(null);
    setStatus("idle");
    setJobId(null);

    const trimmed = text.trim();
    if (!trimmed) {
      setError("Skriv in text att syntetisera.");
      return;
    }

    try {
      const res = await fetch("/api/tts/qwen/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed, voiceId }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error ?? "Kunde inte skapa jobb");
        return;
      }

      const data = (await res.json()) as { jobId: string };
      setJobId(data.jobId);
      setStatus("queued");
      setProgress(0);

      stopPolling();
      pollRef.current = setInterval(pollStatus, 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nätverksfel");
    }
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <div className="mb-8">
          <Link
            href="/author/home"
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            Tillbaka till översikt
          </Link>
        </div>

        <h1 className="mb-2 text-2xl font-semibold tracking-tight">TTS Lab</h1>
        <p className="mb-6 text-sm text-slate-600 dark:text-slate-400">
          Intern sida för att testa Qwen TTS. Skriv text, välj röst, klicka Generate. Worker måste köras separat.
        </p>

        <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
          Text
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          className="mb-4 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:focus:border-slate-50 dark:focus:ring-slate-50"
          placeholder="Skriv text att syntetisera..."
          disabled={status === "running" || status === "queued"}
        />

        <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
          Röst
        </label>
        <select
          value={voiceId}
          onChange={(e) => setVoiceId(e.target.value)}
          className="mb-6 w-full max-w-xs rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
          disabled={status === "running" || status === "queued"}
        >
          {VOICE_OPTIONS.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={handleGenerate}
          disabled={status === "running" || status === "queued" || !text.trim()}
          className="inline-flex items-center rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400 dark:bg-white dark:text-slate-900 dark:hover:bg-white/90"
        >
          {status === "running" || status === "queued" ? `Genererar... ${progress}%` : "Generate"}
        </button>

        {error && (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        {status === "succeeded" && (
          <div className="mt-6">
            {audioUrl ? (
              <>
                <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-200">Ljud</p>
                <audio ref={audioRef} src={audioUrl} controls className="w-full" />
              </>
            ) : (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/30">
                <p className="mb-2 text-sm text-amber-800 dark:text-amber-200">
                  Ljudet är klart men länken kunde inte skapas. Försök hämta igen.
                </p>
                <button
                  type="button"
                  onClick={() => pollStatus()}
                  className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700"
                >
                  Retry fetch
                </button>
              </div>
            )}
          </div>
        )}

        <p className="mt-8 text-xs text-slate-500 dark:text-slate-400">
          Kör worker lokalt: <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">npm run tts-preview-worker</code>
        </p>
      </div>
    </main>
  );
}
