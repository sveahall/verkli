"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { createCandidateAdapter } from "./api-adapter";
import { type CandidateAdapter, type CandidateScopeKey, type CandidateSnapshot, type SavedCandidate } from "./contracts";
import { insertSavedCandidate } from "./insertion";

export default function ManuscriptIllustrations({ editor, scope, ownerId, onSessionState }: { editor: Editor; scope: CandidateScopeKey; ownerId: string; onSessionState: (verified: boolean) => void }) {
  const [owner, setOwner] = useState<string | null>(null);
  const identity = useMemo(() => ({ active: false, owner: null as string | null }), []);
  useEffect(() => {
    let mounted = true;
    const { data } = createClient().auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      const user = session?.user.id ?? null;
      identity.active = user === ownerId;
      identity.owner = identity.active ? user : null;
      onSessionState(identity.active);
      setOwner(identity.owner);
    });
    return () => { mounted = false; identity.active = false; data.subscription.unsubscribe(); };
  }, [identity, ownerId, onSessionState]);
  const adapter = useMemo(() => owner ? createCandidateAdapter(owner, scope) : null, [owner, scope]);
  return adapter && owner ? <IllustrationPicker key={adapter.contextId} editor={editor} scope={scope} adapter={adapter} isOwnerCurrent={() => identity.active && identity.owner === owner} /> : <p className="px-4 py-2 text-sm text-muted-foreground" role="status">Sign in with the same author account to insert saved illustrations. Return to the original account to continue.</p>;
}

/** The production picker also accepts the existing adapter seam for isolated browser QA. */
export function IllustrationPicker({ editor, scope, adapter, isOwnerCurrent }: { editor: Editor; scope: CandidateScopeKey; adapter: CandidateAdapter; isOwnerCurrent: () => boolean }) {
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<CandidateSnapshot | null>(null);
  const [selected, setSelected] = useState<SavedCandidate | null>(null);
  const [alt, setAlt] = useState("");
  const [previewReady, setPreviewReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const lifetime = useRef({ active: true, request: 0, abort: new AbortController() });
  useEffect(() => {
    const current = lifetime.current;
    current.active = true;
    return () => { current.active = false; current.request++; current.abort.abort(); };
  }, []);

  const valid = () => lifetime.current.active && isOwnerCurrent() && !editor.isDestroyed && editor.isEditable;
  async function load() {
    const token = ++lifetime.current.request;
    lifetime.current.abort.abort(); lifetime.current.abort = new AbortController();
    setBusy(true); setError(""); setSnapshot(null); setSelected(null); setPreviewReady(false); setStatus("");
    try {
      const value = await adapter.list(lifetime.current.abort.signal);
      if (valid() && token === lifetime.current.request) setSnapshot(value);
    } catch (failure) {
      if (valid() && token === lifetime.current.request) setError(failure instanceof Error ? failure.message : "Could not load saved illustrations. Try again.");
    } finally { if (valid() && token === lifetime.current.request) setBusy(false); }
  }
  async function insert() {
    if (!selected || !previewReady || !valid()) return;
    const token = ++lifetime.current.request;
    const current = selected;
    setBusy(true); setError(""); setStatus("");
    try {
      await insertSavedCandidate({
        scope, candidate: current, alt, getState: () => editor.state,
        dispatch: (transaction) => editor.view.dispatch(transaction),
        isCurrent: () => valid() && token === lifetime.current.request,
        verify: async () => {
          const refreshed = await adapter.list(lifetime.current.abort.signal);
          if (!refreshed.candidates.some((item) => item.id === current.id && item.imageUrl === current.imageUrl)) throw new Error("This saved illustration is no longer available. Reload the list.");
          const response = await fetch(current.imageUrl, { credentials: "same-origin", cache: "no-store", signal: lifetime.current.abort.signal });
          if (!response.ok || !["image/png", "image/jpeg"].includes(response.headers.get("content-type") ?? "")) throw new Error("The private illustration could not be verified. Your manuscript is unchanged. Retry or reload the list.");
          const bytes = await response.blob();
          if (!bytes.size || bytes.size > 10 * 1024 * 1024) throw new Error("The illustration could not be read. Your manuscript is unchanged.");
        },
      });
      if (valid() && token === lifetime.current.request) {
        setStatus("Illustration inserted. Check the editor’s save status; Undo removes this insertion.");
        setSelected(null); setPreviewReady(false);
      }
    } catch (failure) {
      if (valid() && token === lifetime.current.request) setError(failure instanceof Error ? failure.message : "Could not insert this illustration. Your manuscript is unchanged.");
    } finally { if (valid() && token === lifetime.current.request) setBusy(false); }
  }

  return <section aria-label="Saved chapter illustrations" className="shrink-0 border-b border-border bg-card px-4 py-2 text-sm text-foreground">
    <Button variant="secondary" size="sm" aria-expanded={open} onClick={() => { setOpen(!open); if (!open) void load(); }}>Saved illustrations</Button>
    {open && <div className="mt-3 max-h-[45vh] space-y-3 overflow-y-auto pb-2">
      <p>Insert a saved illustration into this chapter at the cursor, after any selected text. Your existing writing stays intact.</p>
      <p className="text-muted-foreground">Readers must have access to this chapter to see its illustrations. Print PDF export currently rejects illustrated chapters; it does not omit pictures silently.</p>
      <div className="flex flex-wrap items-center gap-2"><Button size="sm" variant="secondary" disabled={busy} onClick={() => void load()}>Reload illustrations</Button><a className="underline" href={`/author/books/${scope.bookId}/editions/${scope.editionId}/chapters/${scope.chapterId}/illustrations`} target="_blank" rel="noopener noreferrer">Manage saved candidates in a new tab</a></div>
      {busy && <p role="status">Checking this chapter’s saved illustrations…</p>}
      {snapshot?.candidates.length === 0 && <p>No saved illustrations for this chapter yet. Save a candidate first, then reload this list.</p>}
      {snapshot && snapshot.candidates.length > 0 && <label className="block">Saved illustration<select className="input-base mt-1 w-full" disabled={busy} value={selected?.id ?? ""} onChange={(event) => { const item = snapshot.candidates.find((value) => value.id === event.target.value) ?? null; setSelected(item); setAlt(item?.alt ?? ""); setPreviewReady(false); setError(""); setStatus(""); }}><option value="">Choose an illustration</option>{snapshot.candidates.map((item) => <option key={item.id} value={item.id}>{item.alt} · {item.width} × {item.height}</option>)}</select></label>}
      {selected && <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
        {/* Authenticated image response, never a storage URL or a public bucket. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img key={selected.id} src={selected.imageUrl} alt={selected.alt} className="max-h-32 max-w-full rounded-lg object-contain" onLoad={() => setPreviewReady(true)} onError={() => { setPreviewReady(false); setError("The private image preview is unavailable. Reload and try again."); }} />
        <div className="space-y-2"><label className="block">Image description<textarea className="input-base mt-1 w-full" maxLength={500} value={alt} disabled={busy} onChange={(event) => setAlt(event.target.value)} /></label><Button size="sm" disabled={busy || !previewReady || !alt.trim()} onClick={() => void insert()}>Insert into this chapter</Button></div>
      </div>}
      {error && <p role="alert" className="text-destructive">{error}</p>}
    </div>}
    {status && <p role="status" className="mt-2">{status}</p>}
  </section>;
}
