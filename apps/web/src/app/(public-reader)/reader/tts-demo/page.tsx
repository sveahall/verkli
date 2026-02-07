"use client";

import { useState } from "react";

export default function TtsDemoPage() {
  const [text, setText] = useState("Hej, detta är en svensk talsyntes från den lokala desktop-appen.");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSpeak() {
    setError(null);

    if (typeof window === "undefined" || !window.electronAPI?.ttsSpeak) {
      setError("Lokal TTS är bara tillgänglig i Verkli Desktop (Electron).");
      return;
    }

    const trimmed = text.trim();
    if (!trimmed) {
      setError("Texten får inte vara tom.");
      return;
    }

    try {
      setIsSpeaking(true);
      const result = await window.electronAPI.ttsSpeak(trimmed);
      const base64 = result?.audioBase64;
      if (!base64) {
        throw new Error("Ingen ljuddata returnerades från TTS-tjänsten.");
      }

      const byteCharacters = atob(base64);
      const bytes = new Uint8Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i += 1) {
        bytes[i] = byteCharacters.charCodeAt(i);
      }

      const blob = new Blob([bytes], { type: "audio/wav" });
      const url = URL.createObjectURL(blob);
      try {
        const audio = new Audio(url);
        await audio.play();
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error && typeof err.message === "string"
          ? err.message
          : "Ett oväntat fel inträffade vid TTS-syntes.";
      setError(message);
    } finally {
      setIsSpeaking(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">Lokal TTS-demo</h1>
      <p className="mb-6 text-sm text-slate-600 dark:text-slate-300">
        Skriv en kort svensk mening och klicka på <strong>Säg</strong> för att spela upp ljudet
        via Piper som körs lokalt i Electron-main-processen (ingen HTTP /api/tts).
      </p>

      <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
        Text att läsa upp
      </label>
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={4}
        className="mb-4 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:focus:border-slate-50 dark:focus:ring-slate-50"
        placeholder="Skriv något att läsa upp..."
      />

      <button
        type="button"
        onClick={handleSpeak}
        disabled={isSpeaking}
        className="inline-flex items-center rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400 dark:bg-white dark:text-slate-900 dark:hover:bg-white/90"
      >
        {isSpeaking ? "Spelar upp..." : "Säg"}
      </button>

      {error && (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <p className="mt-6 text-xs text-slate-500 dark:text-slate-400">
        Tips: Om du får fel om Piper-binären eller modeller, kontrollera att du följt README för
        lokal TTS på macOS och att miljövariablerna <code>TTS_BIN</code>, <code>TTS_MODEL_PATH</code>{" "}
        och <code>TTS_CONFIG_PATH</code> pekar rätt.
      </p>
    </main>
  );
}

