"use client";

import { useState } from "react";

const REMOVED_NOTICE =
  "PIPER_REMOVED: Lokal legacy-TTS har tagits bort. Använd Qwen3 TTS istället.";

export default function TtsDemoPage() {
  const [text, setText] = useState(
    "Hello, this is a local speech synthesis demo from the desktop app."
  );
  const [error, setError] = useState<string | null>(null);

  async function handleSpeak() {
    setError(null);
    setError(REMOVED_NOTICE);
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">Local TTS demo</h1>
      <p className="mb-6 text-sm text-slate-600 dark:text-slate-300">
        Local legacy-TTS är borttaget i denna branch. Integrera Qwen3 TTS för att återaktivera
        demo-funktionen.
      </p>

      <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
        Text to speak
      </label>
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={4}
        className="mb-4 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:focus:border-slate-50 dark:focus:ring-slate-50"
        placeholder="Type something to speak..."
      />

      <button
        type="button"
        onClick={handleSpeak}
        className="inline-flex items-center rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400 dark:bg-white dark:text-slate-900 dark:hover:bg-white/90"
      >
        Speak (Unavailable)
      </button>

      {error && (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <p className="mt-6 text-xs text-slate-500 dark:text-slate-400">
        {REMOVED_NOTICE}
      </p>
    </main>
  );
}
