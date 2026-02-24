"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
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

type Status = "idle" | "queued" | "running" | "succeeded" | "failed";
type RefAudioSource = "upload" | "record";

export default function TtsLabPage() {
  const [text, setText] = useState("Hej! Detta är en test av Qwen TTS. Skriv din text här.");
  const [voiceId, setVoiceId] = useState<string>(TTS_PREVIEW_DEFAULT_VOICE);
  const [voiceProfile, setVoiceProfile] = useState("");
  const [voiceRefText, setVoiceRefText] = useState("");
  const [voicePrompt, setVoicePrompt] = useState("");
  const [refAudioSource, setRefAudioSource] = useState<RefAudioSource>("upload");
  const [voiceRefAudio, setVoiceRefAudio] = useState<File | null>(null);
  const [useReferenceAudio, setUseReferenceAudio] = useState(true);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [recordedDurationSec, setRecordedDurationSec] = useState<number | null>(null);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
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
        setUseReferenceAudio(true);
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
    try {
      const res = await fetch(
        `/api/tts/qwen/preview/status?jobId=${encodeURIComponent(resolvedJobId)}`
      );
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
    if (useReferenceAudio && !voiceRefAudio) {
      setError("Välj eller spela in ett referensljud, eller avmarkera 'Använd referensljud'.");
      return;
    }

    try {
      const voiceProfileValue = voiceProfile.trim() || undefined;
      const voicePromptValue = voicePrompt.trim() || undefined;
      const voiceRefTextValue = voiceRefText.trim() || undefined;
      const activeReferenceAudio = useReferenceAudio ? voiceRefAudio : null;
      const res = activeReferenceAudio
        ? await (async () => {
            const formData = new FormData();
            formData.set("text", trimmed);
            formData.set("voiceId", voiceId);
            if (voiceProfileValue) formData.set("voiceProfile", voiceProfileValue);
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
              voiceProfile: voiceProfileValue,
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

      stopPolling();
      pollRef.current = setInterval(() => {
        void pollStatus(data.jobId);
      }, 1000);
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
          Basröst (fallback)
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
        <p className="-mt-4 mb-6 text-xs text-slate-500 dark:text-slate-400">
          Används när referensljud inte används.
        </p>

        <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
          Tränad röstprofil (valfritt)
        </label>
        <input
          type="text"
          value={voiceProfile}
          onChange={(e) => setVoiceProfile(e.target.value)}
          className="mb-4 w-full max-w-xs rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
          placeholder="ex: storyteller_v1"
          disabled={status === "running" || status === "queued"}
        />

        <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
          Referensljud för kloning (valfritt)
        </label>
        <div className="mb-3 flex items-center gap-5 text-sm text-slate-700 dark:text-slate-200">
          <label className="inline-flex items-center gap-2">
            <input
              type="radio"
              name="ref-audio-source"
              checked={refAudioSource === "upload"}
              onChange={() => {
                stopRecording();
                setRefAudioSource("upload");
                clearRecordedAudio();
                setUseReferenceAudio(true);
              }}
              disabled={status === "running" || status === "queued"}
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
                setUseReferenceAudio(true);
              }}
              disabled={status === "running" || status === "queued"}
            />
            Spela in nu
          </label>
        </div>

        {refAudioSource === "upload" ? (
          <>
            <input
              type="file"
              accept="audio/*"
              onChange={(e) => {
                stopRecording();
                clearRecordedAudio();
                setVoiceRefAudio(e.target.files?.[0] ?? null);
                setUseReferenceAudio(Boolean(e.target.files?.[0]));
                setRecordingError(null);
              }}
              className="mb-2 block w-full max-w-xs text-sm text-slate-700 file:mr-3 file:rounded-md file:border file:border-slate-300 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-slate-200 dark:text-slate-200 dark:file:border-slate-700 dark:file:bg-slate-800 dark:hover:file:bg-slate-700"
              disabled={status === "running" || status === "queued"}
            />
            {voiceRefAudio ? (
              <div className="mb-4 flex items-center gap-3 text-xs text-slate-600 dark:text-slate-300">
                <span>{voiceRefAudio.name}</span>
                <button
                  type="button"
                  onClick={() => {
                    setVoiceRefAudio(null);
                    setUseReferenceAudio(false);
                  }}
                  className="rounded border border-slate-300 px-2 py-0.5 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
                  disabled={status === "running" || status === "queued"}
                >
                  Rensa
                </button>
              </div>
            ) : (
              <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
                Ladda upp en röstfil för att klona din egen röst (wav/mp3/m4a/webm fungerar).
              </p>
            )}
          </>
        ) : (
          <div className="mb-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  void startRecording();
                }}
                disabled={isRecording || status === "running" || status === "queued"}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                Starta inspelning
              </button>
              <button
                type="button"
                onClick={stopRecording}
                disabled={!isRecording || status === "running" || status === "queued"}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                Stoppa
              </button>
              <button
                type="button"
                onClick={clearRecordedAudio}
                disabled={!voiceRefAudio || status === "running" || status === "queued"}
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
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Inspelad referens: {recordedDurationSec ? `${recordedDurationSec}s` : "klar"}
                </p>
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Klicka Starta, läs din text tydligt i 15-45 sek, och klicka sedan Stoppa.
              </p>
            )}
          </div>
        )}

        {voiceRefAudio && (
          <label className="mb-4 flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            <input
              type="checkbox"
              checked={useReferenceAudio}
              onChange={(e) => setUseReferenceAudio(e.target.checked)}
              disabled={status === "running" || status === "queued"}
            />
            Använd referensljud i nästa generering
          </label>
        )}

        <div className="mb-4 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900/30 dark:text-slate-200">
          <p className="font-medium">Aktiv röstkälla i nästa Generate:</p>
          <p>
            {useReferenceAudio && voiceRefAudio
              ? `Klonad referens (${refAudioSource === "record" ? "inspelad här" : "uppladdad fil"}): ${voiceRefAudio.name}`
              : voiceProfile.trim()
                ? `Röstprofil: ${voiceProfile.trim()}`
                : `Basröst: ${voiceId}`}
          </p>
        </div>

        <div className="mb-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
          <p className="font-medium">Guidelines för bästa röstkloning:</p>
          <p>1. Längd: 15-45 sek (minst 6 sek, helst 20+ sek).</p>
          <p>2. Miljö: tyst rum, nära mikrofonen, ingen musik/reverb.</p>
          <p>3. Innehåll: ett språk och en tydlig neutral rytm.</p>
          <p>4. Referenstext: skriv gärna exakt vad som sägs i ljudfilen.</p>
          <p>5. Röstinstruktion: beskriv accent/tone/pacing kort och konkret.</p>
        </div>

        <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
          Referenstext till ljudfil (valfritt)
        </label>
        <textarea
          value={voiceRefText}
          onChange={(e) => setVoiceRefText(e.target.value)}
          rows={2}
          className="mb-4 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:focus:border-slate-50 dark:focus:ring-slate-50"
          placeholder="Skriv gärna exakt vad som sägs i referensfilen för bättre kloning."
          disabled={status === "running" || status === "queued"}
        />

        <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
          Röstinstruktion (valfritt)
        </label>
        <textarea
          value={voicePrompt}
          onChange={(e) => setVoicePrompt(e.target.value)}
          rows={2}
          className="mb-6 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:focus:border-slate-50 dark:focus:ring-slate-50"
          placeholder="ex: Warm, confident US-English narration with neutral accent."
          disabled={status === "running" || status === "queued"}
        />

        <button
          type="button"
          onClick={handleGenerate}
          disabled={status === "running" || status === "queued" || isRecording || !text.trim()}
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
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Träna/uppdatera röstprofil:{" "}
          <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">
            npm run tts-voice-profile -- --name storyteller_v1 --speaker Ryan --ref-audio /abs/path.wav --ref-text &quot;Hej!&quot;
          </code>
        </p>
      </div>
    </main>
  );
}
