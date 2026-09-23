"use client";

import { useEffect, useRef, useState } from "react";
import { loadLocalImage } from "@/features/book-illustrations/local-image";
import type { LocalIllustrationImage } from "@/features/book-illustrations/contracts";
import { intentSchema, type CandidateAdapter, type CandidateIntent, type CandidateSnapshot, type SavedCandidate } from "./contracts";

const field = "mt-2 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm";
const button = "rounded-xl border border-border px-4 py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50";
const placementNames = { icon: "Chapter icon", "half-page": "Half page", "full-page": "Full page" };

function CandidateImage({ candidate }: { candidate: SavedCandidate }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <p role="status" className="rounded-xl bg-muted p-4 text-sm">Image unavailable. Reload the candidates to retry.</p>;
  // eslint-disable-next-line @next/next/no-img-element -- Authenticated private bytes must not pass through a public image optimizer.
  return <img src={candidate.imageUrl} alt={candidate.alt} onError={() => setFailed(true)} className="h-48 w-full object-contain" />;
}

export default function CandidatePanel({ adapter }: { adapter: CandidateAdapter }) {
  const [binding, setBinding] = useState({ adapter, revision: 0 });
  if (binding.adapter !== adapter) setBinding({ adapter, revision: binding.revision + 1 });
  return <CandidateSession key={`${adapter.contextId}:${binding.revision}`} adapter={adapter} />;
}

function CandidateSession({ adapter }: { adapter: CandidateAdapter }) {
  const [snapshot, setSnapshot] = useState<CandidateSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [image, setImage] = useState<LocalIllustrationImage | null>(null);
  const [alt, setAlt] = useState("");
  const [placement, setPlacement] = useState<CandidateIntent["placement"]>("half-page");
  const [style, setStyle] = useState({ name: "", medium: "", palette: "" });
  const [reload, setReload] = useState(0);
  const resources = useRef<{ image: LocalIllustrationImage | null; read: AbortController | null; save: AbortController | null; alive: boolean; token: number }>({ image: null, read: null, save: null, alive: true, token: 0 });
  // Freeze the exact intent across uncertain saves. Edits explicitly begin a new request.
  const pending = useRef<CandidateIntent | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const state = resources.current; state.alive = true;
    return () => { state.alive = false; state.token += 1; state.read?.abort(); state.save?.abort(); state.image?.dispose(); };
  }, []);
  useEffect(() => {
    const controller = new AbortController(); let current = true;
    setLoading(true);
    adapter.list(controller.signal).then((data) => { if (current) { setSnapshot(data); setError(""); } }).catch((cause) => { if (current) setError(cause instanceof Error ? cause.message : "Could not load candidates."); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; controller.abort(); };
  }, [adapter, reload]);

  function edited() { pending.current = null; setNotice(""); setError(""); }
  function discard() {
    const state = resources.current; state.token += 1; state.read?.abort(); state.image?.dispose(); state.image = null;
    setImage(null); setReading(false); setAlt(""); edited();
    if (input.current) input.current.value = "";
  }
  async function choose(file?: File) {
    if (!file || resources.current.save) return;
    const state = resources.current; state.read?.abort(); const token = ++state.token;
    const controller = new AbortController(); state.read = controller; setReading(true); setError(""); setNotice("");
    try {
      const next = await loadLocalImage(file, controller.signal);
      if (!state.alive || token !== state.token) { next.dispose(); return; }
      // A rejected replacement retains the previous file and its exact retry intent.
      edited();
      state.image?.dispose(); state.image = next; setImage(next);
    } catch (cause) { if (state.alive && token === state.token) setError(cause instanceof Error ? cause.message : "Could not read this image."); }
    finally { if (state.alive && token === state.token) setReading(false); }
  }
  async function save() {
    const state = resources.current;
    if (!image || !snapshot || state.save) return;
    const parsed = intentSchema.safeParse(pending.current ?? { requestId: crypto.randomUUID(), expectedChapterVersion: snapshot.scope.chapterVersion, alt, placement, styleSnapshot: style });
    if (!parsed.success) { setError("Add alternative text and all three style descriptions before saving."); return; }
    pending.current = parsed.data;
    const controller = new AbortController(); state.save = controller; setSaving(true); setError(""); setNotice("");
    try {
      const candidate = await adapter.save(parsed.data, image.file, controller.signal);
      if (!state.alive || controller.signal.aborted) return;
      setSnapshot((previous) => previous ? { ...previous, candidates: [candidate, ...previous.candidates.filter((item) => item.id !== candidate.id)].slice(0, 25) } : previous);
      setNotice("Saved image candidate. Not inserted into manuscript.");
      // Fetch current chapter version so a saved candidate can be labelled as stale.
      try {
        const current = await adapter.list(controller.signal);
        if (state.alive && !controller.signal.aborted) setSnapshot(current);
      } catch { if (state.alive && !controller.signal.aborted) setError("The candidate was saved, but the current chapter could not be reloaded. Reload candidates to check its source version."); }
    } catch (cause) { if (state.alive && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not confirm the save. Keep your proposal and retry."); }
    finally { if (state.save === controller) state.save = null; if (state.alive && !controller.signal.aborted) setSaving(false); }
  }
  return <section className="mx-auto max-w-6xl space-y-6" aria-labelledby="candidate-heading">
    <header><p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Book studio / illustrations</p><h1 id="candidate-heading" className="mt-2 text-3xl font-semibold tracking-tight">Image candidates</h1><p className="mt-3 max-w-2xl text-sm text-muted-foreground">Save a private image proposal for your chapter. Saved candidates are not inserted into the manuscript.</p></header>
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4"><div><h2 className="font-medium">{snapshot?.scope.chapterTitle ?? "Your chapter"}</h2><p className="text-sm text-muted-foreground">{snapshot ? `Text version ${snapshot.scope.chapterVersion}` : "Loading chapter…"}</p></div><button className={button} disabled={saving || loading} onClick={() => { setNotice(""); setReload((n) => n + 1); }}>Reload candidates</button></div>
    {error && <p role="alert" className="rounded-xl border border-red-400/50 bg-red-500/5 p-4 text-sm">{error}</p>}
    {notice && <p role="status" className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-4 text-sm">{notice}</p>}
    {snapshot && pending.current && pending.current.expectedChapterVersion !== snapshot.scope.chapterVersion && <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/40 p-4 text-sm"><p>This proposal was prepared for text version {pending.current.expectedChapterVersion}. Review it against version {snapshot.scope.chapterVersion} before making a new save request.</p><button className={button} disabled={saving} onClick={() => { pending.current = null; setError(""); setNotice("Proposal reviewed against the current text version. Save to create a new candidate."); }}>Use current text version</button></div>}
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4 rounded-2xl border border-border p-5"><h2 className="text-lg font-semibold">Local proposal</h2><p className="text-sm text-muted-foreground">PNG or JPEG, up to 10 MB. Your proposal stays here if saving fails.</p>
        <fieldset disabled={saving || reading} className="space-y-4 disabled:opacity-70">
          <label className="block text-sm font-medium">Image file<input ref={input} type="file" accept="image/png,image/jpeg" className={field} onChange={(event) => void choose(event.target.files?.[0])} /></label>
          <label className="block text-sm font-medium">Alternative text<textarea className={field} maxLength={500} value={alt} onChange={(event) => { setAlt(event.target.value); edited(); }} /></label>
          <label className="block text-sm font-medium">Placement<select className={field} value={placement} onChange={(event) => { setPlacement(event.target.value as CandidateIntent["placement"]); edited(); }}>{Object.entries(placementNames).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
          <div className="grid gap-4 sm:grid-cols-2">{(["name", "medium", "palette"] as const).map((key) => <label key={key} className={`block text-sm font-medium ${key === "palette" ? "sm:col-span-2" : ""}`}>{key === "name" ? "Style name" : key === "medium" ? "Medium" : "Palette"}<input className={field} maxLength={key === "palette" ? 300 : 120} value={style[key]} onChange={(event) => { setStyle({ ...style, [key]: event.target.value }); edited(); }} /></label>)}</div>
        </fieldset>
        {reading && <p role="status" className="text-sm">Reading image…</p>}
        {image && <div className="rounded-xl bg-muted/40 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- Local preview owns and disposes its object URL. */}
          <img src={image.url} alt={alt || "Local image proposal"} className={`${placement === "icon" ? "mx-auto h-20 w-20" : placement === "full-page" ? "h-80 w-full" : "h-44 w-full"} object-contain`} />
          <p className="mt-3 text-center text-xs text-muted-foreground">{image.width} × {image.height} · {placementNames[placement]} · Placement preview</p></div>}
        <div className="flex flex-wrap gap-3"><button className={`${button} bg-foreground text-background`} disabled={!image || !snapshot || loading || saving || reading || !alt.trim() || !style.name.trim() || !style.medium.trim() || !style.palette.trim()} onClick={() => void save()}>{saving ? "Saving candidate…" : "Save image candidate"}</button><button className={button} disabled={saving || reading || !image} onClick={discard}>Discard local proposal</button></div>
      </div>
      <div className="space-y-4"><div><h2 className="text-lg font-semibold">Saved candidates</h2><p className="mt-1 text-sm text-muted-foreground">Latest 25 candidates for this chapter. Style descriptions are saved with each image.</p></div>
        {loading && !snapshot ? <p role="status" className="rounded-xl bg-muted/40 p-6">Loading candidates…</p> : !snapshot ? <p className="rounded-xl bg-muted/40 p-6">Candidates could not be loaded. Retry to verify your chapter before saving.</p> : !snapshot.candidates.length ? <p className="rounded-xl bg-muted/40 p-6">No saved image candidates yet. Choose an image to prepare your first proposal.</p> : snapshot.candidates.map((candidate) => <article key={`${candidate.id}:${reload}`} className="space-y-3 rounded-2xl border border-border p-5"><CandidateImage candidate={candidate} /><h3 className="text-sm font-medium">{candidate.alt}</h3><p className="text-sm text-muted-foreground">{placementNames[candidate.placement]} · {candidate.styleSnapshot.name} · {candidate.width} × {candidate.height}</p><p className="text-xs text-muted-foreground">{candidate.styleSnapshot.medium} · {candidate.styleSnapshot.palette}</p><p className="text-xs">Saved image candidate. Not inserted into manuscript.</p>{candidate.sourceChapterVersion !== snapshot.scope.chapterVersion && <p className="rounded-lg bg-amber-500/10 p-3 text-sm">Based on older text (version {candidate.sourceChapterVersion}). Review this candidate against the current chapter.</p>}</article>)}
      </div>
    </div>
  </section>;
}
