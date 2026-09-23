"use client";

import { useEffect, useRef, useState } from "react";
import type { ApprovedIllustration, IllustrationAdapter, IllustrationChapter, IllustrationImageLoader, IllustrationPlacement, IllustrationProfile, LocalIllustrationImage } from "./contracts";
import { loadLocalImage } from "./local-image";

const field = "mt-2 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm";
const button = "rounded-xl border border-border px-4 py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50";
const placements: Record<IllustrationPlacement, string> = { icon: "Chapter icon", "half-page": "Half page", "full-page": "Full page" };

// File ownership stays with the adapter; each rendered preview owns its URL.
function ApprovedImage({ image }: { image: ApprovedIllustration }) {
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const url = URL.createObjectURL(image.file);
    if (ref.current) ref.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [image.file]);
  // eslint-disable-next-line @next/next/no-img-element -- Local object URL, no upload or remote optimizer.
  return <img ref={ref} alt={image.alt} className="max-h-64 w-full object-contain" />;
}

function PagePreview({ chapter, placement, children }: { chapter: IllustrationChapter; placement: IllustrationPlacement; children: React.ReactNode }) {
  return <div className="mx-auto max-w-sm rounded-sm border border-stone-200 bg-[#fffdf7] p-5 text-stone-800 shadow-sm">
    <p className="mb-4 text-center font-serif text-lg">{chapter.title}</p>
    <div className={placement === "icon" ? "mx-auto mb-4 w-20" : placement === "half-page" ? "mb-4 min-h-32" : "mb-4 flex min-h-72 items-center"}>{children}</div>
    {placement !== "full-page" && <p className="font-serif text-sm leading-relaxed">{chapter.excerpt}</p>}
    <p className="mt-5 text-center text-[10px] uppercase tracking-widest text-stone-500">Placement preview · {placements[placement]}</p>
  </div>;
}

export default function IllustrationPanel({ adapter, imageLoader = loadLocalImage }: { adapter: IllustrationAdapter; imageLoader?: IllustrationImageLoader }) {
  const [binding, setBinding] = useState({ adapter, revision: 0 });
  if (binding.adapter !== adapter) setBinding({ adapter, revision: binding.revision + 1 });
  return <IllustrationBook key={`${adapter.snapshot().contextId}:${binding.revision}`} adapter={adapter} imageLoader={imageLoader} />;
}

function IllustrationBook({ adapter, imageLoader }: { adapter: IllustrationAdapter; imageLoader: IllustrationImageLoader }) {
  const [chapterId, setChapterId] = useState("");
  const [profileId, setProfileId] = useState("");
  const [busy, setBusy] = useState(false);
  const [, refresh] = useState(0);
  const snapshot = adapter.snapshot();
  const chapter = snapshot.chapters.find((item) => item.id === chapterId);
  const profile = snapshot.profiles.find((item) => item.id === profileId);
  return <section className="mx-auto max-w-6xl space-y-6" aria-labelledby="illustration-heading">
    <header><p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Book studio / illustrations</p><h1 id="illustration-heading" className="mt-2 text-3xl font-semibold tracking-tight">Chapter illustrations</h1><p className="mt-3 max-w-2xl text-sm text-muted-foreground">Try an image alongside your chapter. Review the placement and alternative text before approving a demo preview.</p></header>
    <p className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm"><strong>Local demo — not saved to a real book.</strong> Images stay in this browser session and disappear on reload. No upload or AI generation.</p>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-medium">Chapter<select className={field} value={chapterId} disabled={busy} onChange={(event) => setChapterId(event.target.value)}><option value="">Choose a chapter</option>{snapshot.chapters.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      <label className="text-sm font-medium">Style profile<select className={field} value={profileId} disabled={busy} onChange={(event) => setProfileId(event.target.value)}><option value="">Choose a style</option>{snapshot.profiles.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    </div>
    {!snapshot.chapters.length ? <p className="rounded-2xl bg-muted/40 p-8">No chapters available in this book.</p> : !snapshot.profiles.length ? <p className="rounded-2xl bg-muted/40 p-8">No style profiles available. Add a profile before preparing an illustration.</p> : !chapter || !profile ? <p className="rounded-2xl bg-muted/40 p-8">Choose a chapter and a style profile to start your preview.</p> : <ChapterSession key={`${chapter.id}:${chapter.revision}:${profile.id}:${profile.revision}`} chapter={chapter} profile={profile} adapter={adapter} imageLoader={imageLoader} onBusy={setBusy} onApproved={() => refresh((value) => value + 1)} />}
  </section>;
}

function ChapterSession({ chapter, profile, adapter, imageLoader, onBusy, onApproved }: { chapter: IllustrationChapter; profile: IllustrationProfile; adapter: IllustrationAdapter; imageLoader: IllustrationImageLoader; onBusy(value: boolean): void; onApproved(): void }) {
  const [placement, setPlacement] = useState<IllustrationPlacement>("half-page");
  const [alt, setAlt] = useState("");
  const [candidate, setCandidate] = useState<LocalIllustrationImage | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const resource = useRef<LocalIllustrationImage | null>(null);
  const request = useRef(0);
  const reading = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const savingRef = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; request.current += 1; reading.current?.abort(); resource.current?.dispose(); onBusy(false); };
  }, [onBusy]);

  function discard() {
    request.current += 1; reading.current?.abort(); reading.current = null;
    resource.current?.dispose(); resource.current = null;
    setCandidate(null); setLoading(false); setAlt(""); setError(""); setNotice("");
    if (input.current) input.current.value = "";
  }
  async function choose(file: File | undefined) {
    if (!file || savingRef.current) return;
    discard();
    const token = ++request.current;
    setLoading(true);
    const controller = new AbortController(); reading.current = controller;
    try {
      const image = await imageLoader(file, controller.signal);
      if (!mounted.current || token !== request.current) { image.dispose(); return; }
      resource.current = image; setCandidate(image);
    } catch (cause) {
      if (mounted.current && token === request.current) setError(cause instanceof Error ? cause.message : "Could not read this image. Try another file.");
    } finally { if (mounted.current && token === request.current) setLoading(false); }
  }
  async function approve() {
    if (!candidate || !alt.trim() || savingRef.current) return;
    savingRef.current = true; setSaving(true); onBusy(true); setError(""); setNotice("");
    try {
      await adapter.approve({ chapterId: chapter.id, expectedChapterRevision: chapter.revision, expectedIllustrationRevision: chapter.illustration?.revision ?? null, profileId: profile.id, expectedProfileRevision: profile.revision, file: candidate.file, width: candidate.width, height: candidate.height, alt: alt.trim(), placement });
      if (!mounted.current) return;
      discard(); onApproved(); setNotice("Demo preview approved. It is not saved to a real book.");
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : "Could not approve the preview. Your proposal is still here.");
    } finally {
      savingRef.current = false;
      if (mounted.current) { setSaving(false); onBusy(false); }
    }
  }
  const approved = chapter.illustration;
  return <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
    <div className="min-w-0 space-y-5 rounded-2xl border border-border p-5">
      <div><h2 className="font-semibold">Prepare your image</h2><p className="mt-2 text-sm text-muted-foreground">{profile.medium} · {profile.palette}</p><p className="mt-2 text-xs text-muted-foreground">Profile revision {profile.revision}. This describes the style; it does not transform your image.</p></div>
      <label className="block text-sm font-medium">Placement<select className={field} disabled={saving} value={placement} onChange={(event) => setPlacement(event.target.value as IllustrationPlacement)}>{Object.entries(placements).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="block text-sm font-medium">Local image<input ref={input} className={`${field} file:mr-2 file:rounded-lg file:border-0 file:bg-muted file:p-2 file:text-xs`} type="file" accept="image/png,image/jpeg" disabled={saving} onChange={(event) => void choose(event.target.files?.[0])} /><span className="mt-2 block text-xs font-normal text-muted-foreground">PNG or JPEG · up to 10 MB and 40 megapixels</span></label>
      <label className="block text-sm font-medium">Alternative text<textarea className={field} rows={3} maxLength={500} disabled={saving} value={alt} onChange={(event) => setAlt(event.target.value)} placeholder="Describe what the image adds to the chapter" /><span className="mt-1 block text-xs font-normal text-muted-foreground">Required · {alt.length}/500 characters</span></label>
      {candidate && <div className="text-xs text-muted-foreground"><p>{candidate.width} × {candidate.height} pixels</p><p className="mt-1">Preview only. Print quality and export are not verified.</p>{Math.min(candidate.width, candidate.height) < 600 && <p className="mt-2 text-amber-700 dark:text-amber-300">Small image: enlarging it may look blurred.</p>}</div>}
      {loading && <p role="status" className="text-sm">Reading local image…</p>}
      {error && <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      {notice && <p role="status" className="rounded-xl bg-primary/10 p-3 text-sm">{notice}</p>}
      <div className="flex flex-wrap gap-2"><button type="button" className={`${button} bg-primary text-primary-foreground`} disabled={!candidate || loading || !alt.trim() || saving} onClick={() => void approve()}>{saving ? "Approving…" : "Approve demo preview"}</button><button type="button" className={button} disabled={saving || (!candidate && !loading)} onClick={discard}>Discard proposal</button></div>
    </div>
    <div className="grid min-w-0 gap-5 sm:grid-cols-2">
      <section aria-label="Approved demo preview" className="min-w-0 space-y-3"><h2 className="text-sm font-semibold">Approved demo preview</h2>{approved ? <><PagePreview chapter={chapter} placement={approved.placement}><ApprovedImage image={approved} /></PagePreview><p className="text-xs text-muted-foreground">{approved.profile.name} · revision {approved.profile.revision}</p></> : <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">No approved illustration yet. Your chapter text is unchanged.</div>}</section>
      <section aria-label="Proposed preview" className="min-w-0 space-y-3"><h2 className="text-sm font-semibold">Proposed preview</h2>{candidate ? <PagePreview chapter={chapter} placement={placement}>
        {/* eslint-disable-next-line @next/next/no-img-element -- Local object URL owned by this session. */}
        <img src={candidate.url} alt={alt.trim() || "Proposed local illustration"} className="max-h-64 w-full object-contain" />
      </PagePreview> : <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">Choose a local image to preview its placement.</div>}</section>
      <aside className="rounded-xl bg-muted/40 p-4 sm:col-span-2"><h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Original chapter text</h2><p className="mt-2 font-serif text-sm leading-relaxed">{chapter.excerpt}</p></aside>
    </div>
  </div>;
}
