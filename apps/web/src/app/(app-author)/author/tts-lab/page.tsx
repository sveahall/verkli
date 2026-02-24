"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  TTS_PREVIEW_VOICE_ALLOWLIST,
  TTS_PREVIEW_DEFAULT_VOICE,
} from "@/lib/tts/preview-voices";

const VOICE_OPTIONS = TTS_PREVIEW_VOICE_ALLOWLIST.map((id) => ({
  id,
  label:
    id === TTS_PREVIEW_DEFAULT_VOICE
      ? `${id.replaceAll("_", " ")} (default)`
      : id.replaceAll("_", " "),
}));

const POLL_INTERVAL_MS = 2_000;
const MAX_POLL_DURATION_MS = 5 * 60 * 1000;
const QUEUED_TOO_LONG_MS = 20_000;

type Status = "idle" | "queued" | "running" | "succeeded" | "failed";
type RefAudioSource = "upload" | "record";

export default function TtsLabPage() {
  const [text, setText] = useState("Hej! Detta är en test av Qwen TTS. Skriv din text här.");
  const [voiceId, setVoiceId] = useState<string>(TTS_PREVIEW_DEFAULT_VOICE);
  const [voiceRefText, setVoiceRefText] = useState("");
  const [voicePrompt, setVoicePrompt] = useState("");
  const [refAudioSource, setRefAudioSource] = useState<RefAudioSource>("upload");
  const [voiceRefAudio, setVoiceRefAudio] = useState<File | null>(null);
  const [voiceMode, setVoiceMode] = useState<"standard" | "clone">("standard");
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [recordedDurationSec, setRecordedDurationSec] = useState<number | null>(null);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queuedWarning, setQueuedWarning] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartedAtRef = useRef(0);
  const pollInFlightRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const recordingStartedAtRef = useRef<number | null>(null);
  const recordedAudioUrlRef = useRef<string | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const clearRecordedAudio = useCallback(() => {
    if (recordedAudioUrl) {
      URL.revokeObjectURL(recordedAudioUrl);
    }
    setRecordedAudioUrl(null);
    setRecordedDurationSec(null);
    setVoiceRefAudio(null);
    setRecordingError(null);
  }, [recordedAudioUrl]);

  const stopMediaStream = useCallback(() => {
    if (!mediaStreamRef.current) return;
    for (const track of mediaStreamRef.current.getTracks()) {
      track.stop();
    }
    mediaStreamRef.current = null;
  }, []);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    recorder.stop();
    setIsRecording(false);
  }, []);

  const startRecording = useCallback(async () => {
    setRecordingError(null);

    if (!("MediaRecorder" in window) || !navigator.mediaDevices?.getUserMedia) {
      setRecordingError(
        window.isSecureContext
          ? "Den här webvyn stöder inte mikrofoninspelning. Öppna sidan i Safari/Chrome direkt."
          : "Inspelning kräver secure context (https eller localhost). Ladda upp fil istället."
      );
      return;
    }

    stopRecording();
    stopMediaStream();
    clearRecordedAudio();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const supportedType = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ].find((mime) => {
        const canCheck = typeof MediaRecorder.isTypeSupported === "function";
        return !canCheck || MediaRecorder.isTypeSupported(mime);
      });

      const recorder = supportedType ? new MediaRecorder(stream, { mimeType: supportedType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recordChunksRef.current = [];
      recordingStartedAtRef.current = Date.now();

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordChunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        setRecordingError("Inspelningen misslyckades. Försök igen eller ladda upp fil.");
        setIsRecording(false);
        stopMediaStream();
      };

      recorder.onstop = () => {
        setIsRecording(false);
        const chunks = recordChunksRef.current;
        recordChunksRef.current = [];

        if (!chunks.length) {
          setRecordingError("Ingen ljuddata spelades in. Försök igen.");
          stopMediaStream();
          return;
        }

        const mimeType = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunks, { type: mimeType });
        const extension = mimeType.includes("mp4") ? "m4a" : mimeType.includes("ogg") ? "ogg" : "webm";
        const file = new File([blob], `voice-ref-${Date.now()}.${extension}`, { type: mimeType });
        const url = URL.createObjectURL(blob);

        setVoiceRefAudio(file);
        setRecordedAudioUrl(url);
        setRecordedDurationSec(
          recordingStartedAtRef.current ? Math.max(1, Math.round((Date.now() - recordingStartedAtRef.current) / 1000)) : null
        );
        stopMediaStream();
      };

      recorder.start();
      setIsRecording(true);
    } catch (e) {
      setRecordingError(e instanceof Error ? e.message : "Kunde inte starta mikrofonen.");
      setIsRecording(false);
      stopMediaStream();
    }
  }, [clearRecordedAudio, stopMediaStream, stopRecording]);

  useEffect(() => {
    recordedAudioUrlRef.current = recordedAudioUrl;
  }, [recordedAudioUrl]);

  useEffect(() => {
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      if (mediaStreamRef.current) {
        for (const track of mediaStreamRef.current.getTracks()) {
          track.stop();
        }
        mediaStreamRef.current = null;
      }
      if (recordedAudioUrlRef.current) {
        URL.revokeObjectURL(recordedAudioUrlRef.current);
      }
    };
  }, []);

  const pollStatus = useCallback(async (jobIdOverride?: string) => {
    const resolvedJobId = jobIdOverride ?? jobId;
    if (!resolvedJobId) return;
    if (pollInFlightRef.current) return;

    if (pollStartedAtRef.current && Date.now() - pollStartedAtRef.current > MAX_POLL_DURATION_MS) {
      setError("Jobbet tog för lång tid. Kontrollera att workern körs och försök igen.");
      setStatus("failed");
      stopPolling();
      return;
    }

    pollInFlightRef.current = true;
    try {
      const res = await fetch(
        `/api/tts/qwen/preview/status?jobId=${encodeURIComponent(resolvedJobId)}`
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error ?? "Kunde inte hämta status");
        setStatus("failed");
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

      if (data.status === "queued" && pollStartedAtRef.current) {
        setQueuedWarning(Date.now() - pollStartedAtRef.current > QUEUED_TOO_LONG_MS);
      } else {
        setQueuedWarning(false);
      }

      if (data.audioUrl) {
        setAudioUrl(data.audioUrl);
        stopPolling();
      }
      if (data.status === "failed" || data.status === "succeeded") {
        stopPolling();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nätverksfel");
      setStatus("failed");
      stopPolling();
    } finally {
      pollInFlightRef.current = false;
    }
  }, [jobId, stopPolling]);

  const handleGenerate = async () => {
    setError(null);
    setAudioUrl(null);
    setStatus("idle");
    setJobId(null);
    setQueuedWarning(false);

    const trimmed = text.trim();
    if (!trimmed) {
      setError("Skriv in text att syntetisera.");
      return;
    }
    if (voiceMode === "clone" && !voiceRefAudio) {
      setError("Välj eller spela in ett referensljud för kloning.");
      return;
    }

    try {
      const voicePromptValue = voicePrompt.trim() || undefined;
      const voiceRefTextValue = voiceRefText.trim() || undefined;
      const activeReferenceAudio = voiceMode === "clone" ? voiceRefAudio : null;
      const res = activeReferenceAudio
        ? await (async () => {
            const formData = new FormData();
            formData.set("text", trimmed);
            formData.set("voiceId", voiceId);
            if (voiceRefTextValue) formData.set("voiceRefText", voiceRefTextValue);
            if (voicePromptValue) formData.set("voicePrompt", voicePromptValue);
            formData.set("voiceRefAudio", activeReferenceAudio);
            return fetch("/api/tts/qwen/preview", {
              method: "POST",
              body: formData,
            });
          })()
        : await fetch("/api/tts/qwen/preview", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: trimmed,
              voiceId,
              voiceRefText: voiceRefTextValue,
              voicePrompt: voicePromptValue,
            }),
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
      setQueuedWarning(false);

      stopPolling();
      pollStartedAtRef.current = Date.now();
      pollInFlightRef.current = false;
      void pollStatus(data.jobId);
      pollRef.current = setInterval(() => {
        void pollStatus(data.jobId);
      }, POLL_INTERVAL_MS);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nätverksfel");
    }
  };

  const handleCancel = async () => {
    stopPolling();
    const cancelJobId = jobId;
    setStatus("idle");
    setJobId(null);
    setProgress(0);
    setError(null);
    setQueuedWarning(false);
    if (cancelJobId) {
      try {
        await fetch(`/api/tts/qwen/preview?jobId=${encodeURIComponent(cancelJobId)}`, {
          method: "DELETE",
        });
      } catch {
        // Best-effort server cancel
      }
    }
  };

  const busy = status === "running" || status === "queued";

  const voiceSummary =
    voiceMode === "clone" && voiceRefAudio
      ? `Klonad referens (${refAudioSource === "record" ? "inspelad" : "fil"}): ${voiceRefAudio.name}`
      : `Basröst: ${voiceId}`;

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
        <p className="mb-8 text-helper">
          Intern sida för att testa Qwen TTS. Skriv text, välj röst, klicka Generate. Worker måste köras separat.
        </p>

        {/* ── Section 1: Text ── */}
        <div className="mb-8">
          <p className="text-eyebrow mb-3">Text</p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            className="input-base text-sm"
            placeholder="Skriv text att syntetisera..."
            disabled={busy}
          />
        </div>

        {/* ── Section 2: Voice mode picker ── */}
        <div className="mb-8">
          <p className="text-eyebrow mb-3">Röstkälla</p>

          {/* Mode cards */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                if (isRecording) {
                  stopRecording();
                  stopMediaStream();
                }
                setVoiceMode("standard");
              }}
              className={cn(
                "card-base-subtle cursor-pointer px-4 py-4 text-left transition",
                voiceMode === "standard"
                  ? "ring-2 ring-slate-900 dark:ring-white"
                  : "opacity-70 hover:opacity-100",
              )}
            >
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Standardröst</p>
              <p className="mt-1 text-helper">Välj bland färdiga röster</p>
            </button>

            <button
              type="button"
              onClick={() => setVoiceMode("clone")}
              className={cn(
                "card-base-subtle cursor-pointer px-4 py-4 text-left transition",
                voiceMode === "clone"
                  ? "ring-2 ring-slate-900 dark:ring-white"
                  : "opacity-70 hover:opacity-100",
              )}
            >
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Klona röst</p>
              <p className="mt-1 text-helper">Ladda upp eller spela in referensljud</p>
            </button>
          </div>

          {/* Expanded panel */}
          <div className="card-base mt-3 p-5">
            {voiceMode === "standard" ? (
              <div className="space-y-4">
                {/* Base voice */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">
                    Basröst
                  </label>
                  <select
                    value={voiceId}
                    onChange={(e) => setVoiceId(e.target.value)}
                    className="input-base max-w-xs text-sm"
                    disabled={busy}
                  >
                    {VOICE_OPTIONS.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Voice prompt */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">
                    Röstinstruktion <span className="text-helper">(valfritt)</span>
                  </label>
                  <textarea
                    value={voicePrompt}
                    onChange={(e) => setVoicePrompt(e.target.value)}
                    rows={2}
                    className="input-base text-sm"
                    placeholder="ex: Warm, confident US-English narration with neutral accent."
                    disabled={busy}
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Upload / Record toggle */}
                <div className="flex items-center gap-5 text-sm text-slate-700 dark:text-slate-200">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      name="ref-audio-source"
                      checked={refAudioSource === "upload"}
                      onChange={() => {
                        stopRecording();
                        setRefAudioSource("upload");
                        clearRecordedAudio();
                      }}
                      disabled={busy}
                    />
                    Ladda upp fil
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      name="ref-audio-source"
                      checked={refAudioSource === "record"}
                      onChange={() => {
                        setRefAudioSource("record");
                        clearRecordedAudio();
                        setRecordingError(null);
                      }}
                      disabled={busy}
                    />
                    Spela in nu
                  </label>
                </div>

                {/* File input / recording controls */}
                {refAudioSource === "upload" ? (
                  <div>
                    <input
                      type="file"
                      accept="audio/*,video/*"
                      onChange={(e) => {
                        stopRecording();
                        clearRecordedAudio();
                        setVoiceRefAudio(e.target.files?.[0] ?? null);
                        setRecordingError(null);
                      }}
                      className="mb-2 block w-full max-w-xs text-sm text-slate-700 file:mr-3 file:rounded-md file:border file:border-slate-300 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-slate-200 dark:text-slate-200 dark:file:border-slate-700 dark:file:bg-slate-800 dark:hover:file:bg-slate-700"
                      disabled={busy}
                    />
                    {voiceRefAudio ? (
                      <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-300">
                        <span>{voiceRefAudio.name}</span>
                        <button
                          type="button"
                          onClick={() => setVoiceRefAudio(null)}
                          className="rounded border border-slate-300 px-2 py-0.5 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
                          disabled={busy}
                        >
                          Rensa
                        </button>
                      </div>
                    ) : (
                      <p className="text-helper">
                        wav/mp3/m4a/webm/mp4/mov fungerar.
                      </p>
                    )}
                  </div>
                ) : (
                  <div>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => { void startRecording(); }}
                        disabled={isRecording || busy}
                        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
                      >
                        Starta inspelning
                      </button>
                      <button
                        type="button"
                        onClick={stopRecording}
                        disabled={!isRecording || busy}
                        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
                      >
                        Stoppa
                      </button>
                      <button
                        type="button"
                        onClick={clearRecordedAudio}
                        disabled={!voiceRefAudio || busy}
                        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
                      >
                        Rensa
                      </button>
                      {isRecording && (
                        <span className="text-xs font-medium text-red-600 dark:text-red-400">Inspelning pågår...</span>
                      )}
                    </div>
                    {recordingError && (
                      <p className="mb-2 text-xs text-red-600 dark:text-red-400">{recordingError}</p>
                    )}
                    {recordedAudioUrl ? (
                      <div className="space-y-2">
                        <audio controls src={recordedAudioUrl} className="w-full max-w-xs" />
                        <p className="text-helper">
                          Inspelad referens: {recordedDurationSec ? `${recordedDurationSec}s` : "klar"}
                        </p>
                      </div>
                    ) : (
                      <p className="text-helper">
                        Klicka Starta, läs din text tydligt i 15-45 sek, och klicka sedan Stoppa.
                      </p>
                    )}
                  </div>
                )}

                {/* Base voice (fallback for clone) */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">
                    Basröst (fallback)
                  </label>
                  <select
                    value={voiceId}
                    onChange={(e) => setVoiceId(e.target.value)}
                    className="input-base max-w-xs text-sm"
                    disabled={busy}
                  >
                    {VOICE_OPTIONS.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Reference text */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">
                    Referenstext till ljudfil <span className="text-helper">(valfritt)</span>
                  </label>
                  <textarea
                    value={voiceRefText}
                    onChange={(e) => setVoiceRefText(e.target.value)}
                    rows={2}
                    className="input-base text-sm"
                    placeholder="Skriv gärna exakt vad som sägs i referensfilen för bättre kloning."
                    disabled={busy}
                  />
                </div>

                {/* Voice prompt */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">
                    Röstinstruktion <span className="text-helper">(valfritt)</span>
                  </label>
                  <textarea
                    value={voicePrompt}
                    onChange={(e) => setVoicePrompt(e.target.value)}
                    rows={2}
                    className="input-base text-sm"
                    placeholder="ex: Warm, confident US-English narration with neutral accent."
                    disabled={busy}
                  />
                </div>

                {/* Collapsible guidelines */}
                <details className="text-helper">
                  <summary className="cursor-pointer text-sm font-medium text-slate-700 dark:text-slate-200">
                    Guidelines för bästa röstkloning
                  </summary>
                  <div className="mt-2 space-y-0.5 text-xs">
                    <p>1. Längd: 15-45 sek (minst 6 sek, helst 20+ sek).</p>
                    <p>2. Miljö: tyst rum, nära mikrofonen, ingen musik/reverb.</p>
                    <p>3. Innehåll: ett språk och en tydlig neutral rytm.</p>
                    <p>4. Referenstext: skriv gärna exakt vad som sägs i ljudfilen.</p>
                    <p>5. Röstinstruktion: beskriv accent/tone/pacing kort och konkret.</p>
                  </div>
                </details>
              </div>
            )}
          </div>
        </div>

        {/* ── Section 3: Generate ── */}
        <div>
          {/* Active voice summary pill */}
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-1.5 text-sm text-slate-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
            {voiceSummary}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={busy || isRecording || !text.trim()}
              className="btn-primary"
            >
              {busy ? `Genererar... ${progress}%` : "Generate"}
            </button>
            {busy && (
              <button
                type="button"
                onClick={() => { void handleCancel(); }}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                Avbryt
              </button>
            )}
          </div>

          {queuedWarning && (
            <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
              Jobbet väntar i kö. Kontrollera att workern körs:{" "}
              <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">npm run tts-preview-worker</code>
            </p>
          )}

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
        </div>

        <p className="mt-8 text-xs text-slate-500 dark:text-slate-400">
          Kör worker lokalt: <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">npm run tts-preview-worker</code>
        </p>
      </div>
    </main>
  );
}
