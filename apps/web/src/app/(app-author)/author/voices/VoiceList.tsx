"use client";

import { useState, useTransition } from "react";

export type VoiceRow = {
  id: string;
  elevenlabs_voice_id: string;
  name: string;
  description: string | null;
  source: "cloned" | "preset" | "professional";
  is_default: boolean;
  status: "ready" | "pending" | "failed" | "deleting";
  created_at: string;
};

export default function VoiceList({ initialVoices }: { initialVoices: VoiceRow[] }) {
  const [voices, setVoices] = useState<VoiceRow[]>(initialVoices);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function onDelete(voice: VoiceRow) {
    if (!window.confirm(`Delete voice "${voice.name}"? This removes it from ElevenLabs as well.`)) {
      return;
    }
    setPendingId(voice.id);
    setError(null);
    try {
      const res = await fetch(`/api/author/voices/${voice.id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(json?.error ?? `Delete failed (${res.status})`);
      }
      startTransition(() => {
        setVoices((cur) => cur.filter((v) => v.id !== voice.id));
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="space-y-3">
      {error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-800 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <ul className="space-y-2">
        {voices.map((v) => (
          <li
            key={v.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium">{v.name}</span>
                {v.is_default ? (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary">
                    Default
                  </span>
                ) : null}
                <span className="rounded-full bg-muted/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {v.source}
                </span>
                <span
                  className={
                    "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider " +
                    (v.status === "ready"
                      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      : v.status === "deleting"
                        ? "bg-amber-500/10 text-amber-800 dark:text-amber-200"
                        : v.status === "failed"
                          ? "bg-red-500/10 text-red-700 dark:text-red-300"
                          : "bg-muted/40 text-muted-foreground")
                  }
                >
                  {v.status}
                </span>
              </div>
              {v.description ? (
                <div className="mt-1 text-sm text-muted-foreground">{v.description}</div>
              ) : null}
              <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                {v.elevenlabs_voice_id}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void onDelete(v)}
              disabled={pendingId === v.id}
              className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-500/10 disabled:opacity-50 dark:text-red-300"
            >
              {pendingId === v.id ? "Deleting…" : "Delete"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
