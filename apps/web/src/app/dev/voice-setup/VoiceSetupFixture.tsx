"use client";
import { useEffect, useRef, useState } from "react";
import VoiceSetupPanel from "@/features/audiobook/VoiceSetupPanel";
import { createVoiceFixture, type FixtureMode } from "./fixture-adapter";
const storageKey = "verkli-voice-studio-v1";
type Fixture = ReturnType<typeof createVoiceFixture>;
export default function VoiceSetupFixture() {
  const [owner, setOwner] = useState("demo-author-a");
  const [mode, setMode] = useState<FixtureMode>("success");
  const modeRef = useRef<FixtureMode>("success");
  const [restart, setRestart] = useState(0);
  const [adapter, setAdapter] = useState<Fixture | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState({ creates: 0, deletes: 0 });
  useEffect(() => {
    let instance: Fixture | null = null;
    let unsubscribe: (() => void) | undefined;
    try {
      instance = createVoiceFixture({ read: () => sessionStorage.getItem(storageKey), write: (value) => sessionStorage.setItem(storageKey, value) }, () => modeRef.current);
      const current = instance;
      unsubscribe = current.subscribe(() => setMetrics(current.metrics()));
      setMetrics(current.metrics()); setAdapter(current); setError(null);
    } catch {
      setAdapter(null); setError("The saved synthetic session is unavailable or invalid. It has not been reset. Restore a valid session or open a new tab to start a separate demo.");
    }
    return () => { unsubscribe?.(); instance?.dispose(); };
  }, [restart]);
  return <><div className="border-b border-border bg-muted/50 px-4 py-4"><div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4"><span className="text-xs font-medium uppercase tracking-wider">Local voice demo</span><label className="flex items-center gap-2 text-xs">Demo author<select className="min-h-11 rounded-lg border border-border bg-background px-3" value={owner} onChange={(event) => setOwner(event.target.value)}><option value="demo-author-a">Demo author A</option><option value="demo-author-b">Demo author B</option></select></label><label className="flex items-center gap-2 text-xs">Worker scenario<select className="min-h-11 rounded-lg border border-border bg-background px-3" value={mode} onChange={(event) => { const value = event.target.value as FixtureMode; modeRef.current = value; setMode(value); }}><option value="success">Successful response</option><option value="failure">Creation fails</option><option value="uncertain">Response lost</option><option value="cleanup-error">Cleanup fails</option></select></label><button className="min-h-11 rounded-lg border border-border bg-background px-3 text-xs" onClick={() => { setAdapter(null); setRestart((value) => value + 1); }}>Restart simulated worker</button><p className="text-xs text-muted-foreground">Synthetic operations: <output aria-label="Synthetic creates">{metrics.creates}</output> creates · <output aria-label="Synthetic deletes">{metrics.deletes}</output> deletes</p></div></div><main className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-12">{error ? <p role="alert" className="rounded-xl border border-destructive/40 p-4 text-sm">{error}</p> : adapter ? <VoiceSetupPanel key={`${owner}-${restart}`} ownerId={owner} adapter={adapter} /> : <p role="status">Loading the synthetic browser session…</p>}</main></>;
}
