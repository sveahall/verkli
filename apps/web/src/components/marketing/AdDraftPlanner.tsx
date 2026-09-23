"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { adDraftSchema, calculateAdBudget, type AdDraft, type SavedAdDraft } from "@/lib/marketing/ad-draft";
import { adDraftsClient, type AdDraftList, type AdDraftsClient } from "@/lib/marketing/ad-drafts-client";
const emptyDraft = (): AdDraft => ({ name: "", channel: "", objective: "", audience: "", headline: "", copy: "", destinationUrl: "", currency: "", totalBudget: "", dailyBudget: null, startDate: "", endDate: "" });
const snapshot = (bookId: string, draft: AdDraft) => JSON.stringify({ bookId, draft });
const textFields: Array<{ key: "name" | "channel" | "objective" | "audience" | "headline" | "copy" | "destinationUrl"; label: string; max: number; multiline?: boolean }> = [
  { key: "name", label: "Draft name", max: 120 }, { key: "channel", label: "Planned channel or placement", max: 80 },
  { key: "objective", label: "Your objective", max: 200 }, { key: "audience", label: "Your intended audience", max: 500, multiline: true },
  { key: "headline", label: "Headline", max: 180 }, { key: "copy", label: "Ad text", max: 5000, multiline: true },
  { key: "destinationUrl", label: "Destination link (HTTPS)", max: 2000 },
];
export function AdDraftPlanner({ client = adDraftsClient, testMode = false }: { client?: AdDraftsClient; testMode?: boolean }) {
  const [list, setList] = useState<AdDraftList | null>(null);
  const [draft, setDraft] = useState<AdDraft>(emptyDraft);
  const [bookId, setBookId] = useState("");
  const [current, setCurrent] = useState<SavedAdDraft | null>(null);
  const [clean, setClean] = useState(() => snapshot("", emptyDraft()));
  const [pending, setPending] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const inFlight = useRef(false);
  const dirty = clean !== snapshot(bookId, draft);
  useEffect(() => {
    let cancelled = false;
    client.list().then(value => { if (!cancelled) setList(value); })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : "Could not load saved drafts."); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [client]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const open = (id: string) => {
    const saved = list?.drafts.find(item => item.id === id) ?? null;
    const next = saved ? structuredClone(saved.draft) : emptyDraft();
    setCurrent(saved); setDraft(next); setBookId(saved?.bookId ?? ""); setClean(snapshot(saved?.bookId ?? "", next));
    setPending(null); setError(null); setNotice(null);
  };
  const choose = (id: string) => { if (dirty) setPending(id); else open(id); };
  const run = async (action: "reload" | "save") => {
    if (busy || inFlight.current) return;
    const parsed = adDraftSchema.safeParse(draft);
    if (action === "save" && (!parsed.success || !bookId)) {
      setError(!bookId ? "Choose a book first." : parsed.success ? "Check the draft." : `${parsed.error.issues[0].path.join(" ")}: ${parsed.error.issues[0].message}`); return;
    }
    inFlight.current = true; setBusy(true); setError(null); setNotice(null);
    try {
      if (action === "reload") { setList(await client.list()); setNotice("Saved list reloaded. Your editor text is unchanged."); }
      else if (parsed.success) {
        const saved = await client.save(bookId, parsed.data, current);
        setCurrent(saved); setDraft(saved.draft); setBookId(saved.bookId); setClean(snapshot(saved.bookId, saved.draft));
        setList(previous => previous ? { ...previous, drafts: [saved, ...previous.drafts.filter(item => item.id !== saved.id)] } : previous);
        setNotice(testMode ? "Saved in this synthetic session. No ad was submitted." : "Draft saved. No ad was submitted and no money was spent.");
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Save could not be confirmed. Your text is still here."); }
    finally { inFlight.current = false; setBusy(false); }
  };
  const valid = adDraftSchema.safeParse(draft);
  const budget = valid.success ? calculateAdBudget(valid.data) : null;
  return <section aria-label="Ad draft planner" className="space-y-6">
    <header className="space-y-2"><h1 className="text-page-title font-display">Ad drafts & budget planning</h1>
      <p className="max-w-3xl text-sm text-muted-foreground">Prepare your message and spending plan. Saving does not launch an ad, reserve funds or enforce a budget on any advertising platform.</p>
      {testMode ? <p className="text-sm font-medium">Synthetic session only · no database, advertising account or payment changes</p> : null}
    </header>
    {error ? <p role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">{error}</p> : null}
    {notice ? <p role="status" className="rounded-xl bg-muted p-3 text-sm">{notice}</p> : null}
    <div className="flex flex-wrap items-end gap-3">
      <label className="min-w-0 basis-full text-sm sm:flex-1 sm:basis-auto">Saved drafts
        <select className="input-base mt-1 w-full" aria-label="Saved drafts" value={current?.id ?? ""} disabled={busy || pending !== null} onChange={event => choose(event.target.value)}>
          <option value="">New draft</option>{list?.drafts.map(item => <option key={item.id} value={item.id}>{item.draft.name}</option>)}
        </select>
      </label>
      <Button variant="secondary" disabled={busy || pending !== null} onClick={() => run("reload")}>Reload saved list</Button>
      <Button variant="ghost" disabled={busy || pending !== null} onClick={() => choose("")}>New draft</Button>
    </div>
    {pending !== null ? <div role="group" aria-label="Unsaved changes" className="space-y-3 rounded-xl border border-border p-4"><p>You have unsaved changes. Discard them and open the selected draft?</p><div className="flex flex-wrap gap-2"><Button onClick={() => open(pending)}>Discard and open</Button><Button variant="secondary" onClick={() => setPending(null)}>Keep editing</Button></div></div> : null}
    {!list ? <p role="status">{busy ? "Loading your books and saved drafts…" : "Saved drafts are unavailable. Reload the list to try again."}</p> : list.books.length === 0 ? <p className="rounded-xl border border-dashed border-border p-5">Add a book to your author account before planning an ad.</p> : <>
      {list.drafts.length === 0 ? <p className="text-sm text-muted-foreground">No saved ad drafts yet. Start with a book and your own plan below.</p> : null}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <form onSubmit={event => { event.preventDefault(); void run("save"); }} className="min-w-0 space-y-4 rounded-2xl border border-border bg-card p-5">
          <fieldset disabled={busy || pending !== null} className="space-y-4">
            <legend className="mb-4 text-section-title">Your draft</legend>
            <label className="block text-sm">Book<select required className="input-base mt-1 w-full" value={bookId} disabled={!!current} onChange={event => setBookId(event.target.value)}><option value="">Choose your book</option>{list.books.map(book => <option key={book.id} value={book.id}>{book.title || "Untitled book"}</option>)}</select></label>
            {textFields.map(field => <label key={field.key} className="block text-sm">{field.label}{field.multiline ? <Textarea className="mt-1" required maxLength={field.max} value={draft[field.key]} onChange={event => setDraft(previous => ({ ...previous, [field.key]: event.target.value }))} /> : <Input className="mt-1" required maxLength={field.max} type={field.key === "destinationUrl" ? "url" : "text"} value={draft[field.key]} onChange={event => setDraft(previous => ({ ...previous, [field.key]: event.target.value }))} />}</label>)}
            <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm">Start date<Input className="mt-1" required type="date" value={draft.startDate} onChange={event => setDraft(previous => ({ ...previous, startDate: event.target.value }))} /></label><label className="text-sm">End date<Input className="mt-1" required type="date" value={draft.endDate} onChange={event => setDraft(previous => ({ ...previous, endDate: event.target.value }))} /></label></div>
            <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm">Planning currency<Input className="mt-1" required maxLength={3} placeholder="Three-letter code" value={draft.currency} onChange={event => setDraft(previous => ({ ...previous, currency: event.target.value.toUpperCase() }))} /></label><label className="text-sm">Total budget cap<Input className="mt-1" required inputMode="decimal" value={draft.totalBudget} onChange={event => setDraft(previous => ({ ...previous, totalBudget: event.target.value }))} /></label></div>
            <label className="block text-sm">Daily budget (optional)<Input className="mt-1" inputMode="decimal" value={draft.dailyBudget ?? ""} onChange={event => setDraft(previous => ({ ...previous, dailyBudget: event.target.value || null }))} /></label>
            <p className="text-xs text-muted-foreground">Use a dot for decimal amounts. Dates include both the first and last day, up to 182 days. Set and verify real limits in the advertising platform separately.</p>
            <div className="flex flex-wrap items-center gap-3"><Button type="submit">{busy ? "Saving…" : "Save draft"}</Button><span role="status" className="text-sm text-muted-foreground">{dirty ? "Unsaved changes" : current ? "Saved draft" : "New draft"}</span></div>
          </fieldset>
        </form>
        <aside className="min-w-0 space-y-5 lg:sticky lg:top-6">
          <div className="space-y-4 rounded-2xl border border-border bg-card p-6"><h2 className="text-section-title">Generic preview</h2><p className="text-xs text-muted-foreground">{draft.channel || "Your chosen placement"} · Platform formatting may differ</p><h3 className="break-words font-display text-2xl">{draft.headline || "Your headline"}</h3><p className="whitespace-pre-wrap break-words text-sm">{draft.copy || "Your ad text will appear here."}</p><p className="break-all text-xs text-muted-foreground">{draft.destinationUrl || "Your destination link"}</p></div>
          <div className="space-y-3 rounded-2xl border border-border p-5"><h2 className="text-section-title">Budget plan</h2>{budget ? <><dl className="space-y-2 text-sm"><div className="flex justify-between gap-4"><dt>Calendar days</dt><dd>{budget.days}</dd></div><div className="flex justify-between gap-4"><dt>Total cap</dt><dd>{budget.totalBudget} {draft.currency}</dd></div><div className="flex justify-between gap-4"><dt>Daily budget</dt><dd>{budget.dailyBudget === null ? "Not set" : `${budget.dailyBudget} ${draft.currency}`}</dd></div><div className="flex justify-between gap-4 font-medium"><dt>Maximum planned spend</dt><dd>{budget.maximumSpend} {draft.currency}</dd></div></dl>{budget.limitedByTotal ? <p className="text-sm">The total cap limits this plan before all daily budgets can be used.</p> : null}</> : <p className="text-sm text-muted-foreground">Complete the required draft fields and valid amounts/dates to calculate the plan.</p>}<p className="text-xs text-muted-foreground">No forecast of reach, sales or return. This is planning arithmetic, not a billing or platform limit.</p></div>
          <div className="rounded-2xl border border-border p-5"><h2 className="text-section-title">Results</h2><p className="mt-2 text-sm text-muted-foreground">Actual spend, reach, clicks and purchases: Not measured. This draft has no connected advertising data.</p></div>
        </aside>
      </div>
    </>}
  </section>;
}
