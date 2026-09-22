"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import type { RecoveryAdapter, RecoveryItem } from "./contracts";

export default function RecoveryPanel({ adapter }: { adapter: RecoveryAdapter }) {
  const context = useMemo(() => ({ adapter }), [adapter]);
  const [items, setItems] = useState<RecoveryItem[]>([]);
  const [selected, setSelected] = useState<RecoveryItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [restoringContext, setRestoringContext] = useState<typeof context | null>(null);
  const restoring = restoringContext === context;
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<{ context: typeof context; text: string } | null>(null);
  const generation = useRef(0);
  const inFlight = useRef<{ context: typeof context } | null>(null);
  const load = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true); setError(""); setSelected(null); setItems([]);
    try {
      const result = await adapter.list();
      if (request === generation.current) setItems(result);
    } catch {
      if (request === generation.current) setError("Could not load the trash. Please try again.");
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [adapter]);
  useEffect(() => { void load(); return () => { generation.current += 1; }; }, [load]);

  async function restore() {
    if (!selected || inFlight.current?.context === context) return;
    const expected = selected;
    const request = generation.current;
    const operation = { context };
    inFlight.current = operation; setRestoringContext(context); setError(""); setNotice(null);
    try {
      await adapter.restore(expected);
      if (request !== generation.current) return;
      setNotice({ context, text: `“${expected.title}” restored as a private draft. Existing content was kept.` });
      await load();
    } catch (cause) {
      if (request === generation.current) {
        setError(cause instanceof Error ? cause.message : "Could not restore this item. Reload the trash and try again.");
        setSelected(null);
      }
    } finally {
      if (inFlight.current === operation) {
        inFlight.current = null; setRestoringContext(null);
      }
    }
  }

  return (
    <section className="mx-auto max-w-5xl space-y-6 rounded-3xl border border-border bg-card p-5 sm:p-8" aria-labelledby="trash-heading">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div><div className="mb-2 flex items-center gap-2 text-muted-foreground"><Trash2 size={18} aria-hidden />Manuscript recovery</div>
          <h1 id="trash-heading" className="text-3xl font-semibold">Trash</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">Preview a removed item before restoring it as a private draft. Restoring never replaces an active manuscript.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading || restoring} className="rounded-xl border border-border px-4 py-3 text-sm disabled:opacity-50">Reload trash</button>
      </header>
      {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">{error}</p>}
      {notice?.context === context && <p role="status" className="rounded-xl bg-primary/10 p-4 text-sm">{notice.text}</p>}
      {loading ? <p role="status">Loading removed manuscripts…</p> : items.length === 0 && !error ? <div className="rounded-2xl bg-muted/40 p-8"><h2 className="font-semibold">Your trash is empty</h2><p className="mt-2 text-sm text-muted-foreground">There are no recoverable books or chapters in this account. Permanently deleted items cannot be recovered here.</p></div> : (
        <div className="grid gap-5 md:grid-cols-2">
          <ul className="space-y-3" aria-label="Removed manuscripts">{items.map((item) => (
            <li key={item.id}><button type="button" disabled={restoring} onClick={() => { setSelected(item); setError(""); setNotice(null); }} aria-pressed={selected?.id === item.id} className={`w-full rounded-2xl border p-4 text-left disabled:opacity-50 ${selected?.id === item.id ? "border-primary bg-primary/5" : "border-border"}`}>
              <span className="text-xs uppercase tracking-wide text-muted-foreground">{item.kind} · {item.edition}</span>
              <span className="mt-1 block font-semibold">{item.title}</span>
              {item.kind === "chapter" && <span className="block text-sm text-muted-foreground">{item.bookTitle}</span>}
              <span className="mt-2 block text-xs text-muted-foreground">Removed {new Date(item.deletedAt).toLocaleDateString("en-GB", { timeZone: "UTC" })}</span>
            </button></li>
          ))}</ul>
          <div className="min-w-0 rounded-2xl bg-muted/40 p-5">
            {selected ? <>
              <h2 className="text-lg font-semibold">Preview: {selected.title}</h2>
              <p className="mt-3 whitespace-pre-wrap break-words text-sm">{selected.preview || "No text preview is available for this item."}</p>
              <p className="mt-5 text-sm text-muted-foreground">{selected.kind === "book" ? "The book returns as a private draft. Separately removed chapters stay in the trash." : "The chapter returns to its original book and edition. An occupied chapter position blocks restoration."}</p>
              <button type="button" disabled={restoring} onClick={() => void restore()} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"><RotateCcw size={16} aria-hidden />{restoring ? "Restoring…" : "Confirm restore as draft"}</button>
            </> : <p className="text-sm text-muted-foreground">Select a book or chapter to inspect its saved text and restore options.</p>}
          </div>
        </div>
      )}
    </section>
  );
}
