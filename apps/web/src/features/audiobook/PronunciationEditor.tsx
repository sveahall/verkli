"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, ArrowRight, Save, RotateCcw } from "lucide-react";
import { applyPronunciation, parsePronunciationSnapshot, pronunciationRulesSchema, PROPOSED_MAX_PRONUNCIATION_RULES, type PronunciationAdapter, type PronunciationRule, type PronunciationScope, type PronunciationSnapshot } from "@/lib/audiobook/pronunciation";

type Props = { scope: PronunciationScope; adapter: PronunciationAdapter; manuscript: string; editionLabel: string };
const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50";
const input = "min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary";

/** Keying the entire editor prevents a late operation leaking into a different owner/edition. */
export default function PronunciationEditor(props: Props) {
  return <EditionEditor key={JSON.stringify(props.scope)} {...props} />;
}
function EditionEditor({ scope: inputScope, adapter, manuscript, editionLabel }: Props) {
  const { ownerId, bookId, editionId } = inputScope;
  const scope = useMemo(() => ({ ownerId, bookId, editionId }), [ownerId, bookId, editionId]);
  const [snapshot, setSnapshot] = useState<PronunciationSnapshot | null>(null);
  const [rules, setRules] = useState<PronunciationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const generation = useRef(0);
  useEffect(() => {
    const activeGeneration = generation.current + 1;
    generation.current = activeGeneration;
    let ignore = false;
    adapter.load(scope).then((value) => {
      if (ignore) return;
      const loaded = parsePronunciationSnapshot(value, scope);
      setSnapshot(loaded); setRules(loaded.rules); setLoading(false); setLoadFailed(false); setError(null); setConflict(false);
    }).catch(() => {
      if (!ignore) { setLoading(false); setLoadFailed(true); setError("Rules could not be loaded. Please retry before editing."); }
    });
    return () => { ignore = true; generation.current = activeGeneration + 1; };
  }, [adapter, scope, reload]);

  const validation = pronunciationRulesSchema.safeParse(rules);
  const preview = validation.success ? applyPronunciation(manuscript, validation.data) : null;
  const dirty = Boolean(snapshot && JSON.stringify(snapshot.rules) !== JSON.stringify(rules));
  const status = loading ? "Loading rules…" : saving ? "Saving in this demo…" : loadFailed ? "Rules could not be loaded." : conflict ? "Another change was saved. Your draft is still here." : error ? "Not saved." : dirty ? "Unsaved changes" : snapshot?.revision ? "Saved in this demo session only" : "No saved rules for this edition";

  async function save() {
    if (!snapshot || !validation.success || loading || loadFailed || saving || conflict) return;
    const startedGeneration = generation.current;
    const isCurrent = () => generation.current === startedGeneration;
    setSaving(true); setError(null);
    try {
      const result = await adapter.save(scope, snapshot.revision, validation.data);
      if (!isCurrent()) return;
      const saved = parsePronunciationSnapshot(result.snapshot, scope);
      if (result.kind === "conflict") { setConflict(true); return; }
      if (result.kind !== "saved" || saved.revision !== snapshot.revision + 1 || JSON.stringify(saved.rules) !== JSON.stringify(validation.data)) throw new Error("Invalid save response");
      setSnapshot(saved); setRules(saved.rules);
    } catch {
      if (isCurrent()) setError("The save was not confirmed. Your draft is still here; retrying may require loading the latest version.");
    } finally { if (isCurrent()) setSaving(false); }
  }
  function loadLatest() {
    setLoading(true); setError(null); setReload((value) => value + 1);
  }
  function edit(index: number, field: keyof PronunciationRule, value: string) {
    setRules((current) => current.map((rule, i) => i === index ? { ...rule, [field]: value } : rule));
    setError(null);
  }
  return <section aria-label="Pronunciation editor" className="space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
      <div><p className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Audio / Pronunciation</p><h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Give each name its voice.</h1><p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">Tell the narrator how a written name should sound. Your manuscript keeps its original spelling.</p></div>
      <span className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium">{editionLabel}</span>
    </header>
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background px-4 py-3">
      <p role="status" aria-live="polite" className="text-sm">{status}</p>
      <button type="button" className={`${button} bg-primary text-primary-foreground hover:bg-primary/90`} onClick={() => void save()} disabled={loading || loadFailed || saving || !dirty || !validation.success || conflict || !snapshot}><Save aria-hidden="true" size={16} />Save in demo</button>
    </div>
    {error && <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm"><p>{error}</p>{loadFailed && <button className={`${button} mt-3`} onClick={loadLatest}>Retry loading rules</button>}</div>}
    {conflict && !loadFailed && <div role="alert" className="rounded-xl border border-amber-400/50 bg-amber-50 p-4 text-sm text-stone-900"><p>This edition has a newer saved version. Your draft has not overwritten it.</p><p className="mt-1">Loading the latest rules replaces your draft. Copy any changes you want to keep first.</p><button className={`${button} mt-3 bg-white`} onClick={loadLatest} disabled={loading || saving}><RotateCcw aria-hidden="true" size={16} />Load latest and replace draft</button></div>}
    {!loading && snapshot && <div className="grid items-start gap-8 lg:grid-cols-[1fr_0.95fr]">
      <div className="space-y-4">
        <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Pronunciation rules</h2><span className="text-xs text-muted-foreground">{rules.length} {rules.length === 1 ? "rule" : "rules"}</span></div>
        {rules.length === 0 && <div className="rounded-2xl border border-dashed border-border px-6 py-10 text-center"><p className="font-medium">Let the spelling speak for itself.</p><p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-muted-foreground">Add a rule for a name or phrase that needs a different spoken form.</p></div>}
        {rules.map((rule, index) => <div key={index} className="rounded-xl border border-border bg-background p-4">
          <div className="mb-3 flex items-center justify-between"><span className="text-xs font-medium text-muted-foreground">RULE {String(index + 1).padStart(2, "0")}</span><button className="flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-muted disabled:opacity-50" disabled={saving || loadFailed} aria-label={`Remove rule ${index + 1}`} onClick={() => { setRules((current) => current.filter((_, i) => i !== index)); setError(null); }}><Trash2 aria-hidden="true" size={16} /></button></div>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr]">
            <label className="space-y-2 text-xs font-medium">Written form<input aria-label={`Written form ${index + 1}`} className={input} value={rule.word} maxLength={120} disabled={saving || loadFailed} onChange={(event) => edit(index, "word", event.target.value)} placeholder="Mira" /></label>
            <ArrowRight aria-hidden="true" size={16} className="hidden self-end mb-3 text-muted-foreground sm:block" />
            <label className="space-y-2 text-xs font-medium">Spoken as<input aria-label={`Spoken as ${index + 1}`} className={input} value={rule.spokenAs} maxLength={200} disabled={saving || loadFailed} onChange={(event) => edit(index, "spokenAs", event.target.value)} placeholder="Mee-ra" /></label>
          </div>
        </div>)}
        {!validation.success && <p role="alert" className="text-sm text-destructive">{validation.error.issues[0]?.message}</p>}
        <button className={`${button} w-full`} disabled={saving || loadFailed || rules.length >= PROPOSED_MAX_PRONUNCIATION_RULES} onClick={() => setRules((current) => [...current, { word: "", spokenAs: "" }])}><Plus aria-hidden="true" size={16} />Add a pronunciation rule</button>
        <p className="text-xs leading-5 text-muted-foreground">Exact spelling and case matter. At the same position, the longest written form wins. Spoken forms are not processed a second time. The demo proposes a maximum of 100 rules.</p>
      </div>
      <aside className="space-y-5 rounded-2xl border border-border bg-muted/30 p-5 sm:p-6">
        <div><h2 className="text-lg font-semibold">Read the difference</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">A text preview only. No voice is generated or played.</p></div>
        <div><h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Manuscript · unchanged</h3><p data-testid="manuscript-preview" className="whitespace-pre-wrap break-words font-display text-xl leading-relaxed">{manuscript}</p></div>
        <div className="border-t border-border pt-5"><h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Narration preview</h3><p data-testid="narration-preview" className="whitespace-pre-wrap break-words font-display text-xl leading-relaxed">{preview?.text ?? "Complete valid rules to preview the narration."}</p></div>
        <p className="text-xs leading-5 text-muted-foreground">{preview ? `${preview.matches.length} literal ${preview.matches.length === 1 ? "match" : "matches"}. ` : ""}Text synchronization is not evaluated in this demo.</p>
      </aside>
    </div>}
  </section>;
}
