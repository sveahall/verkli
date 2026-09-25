"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LANGUAGE_OPTIONS, normalizeLanguage } from "@/lib/languages";
import { TrailerCard } from "@/app/(app-author)/author/books/[id]/editor/panels/MarketPanel";
import type { PortalBook } from "./MarketingPortalView";

type DraftMetadata = { goal?: string; audience?: string; dailyBudget?: string; currency?: string; days?: string };
type Asset = { metadata?: DraftMetadata; id: string; text: string; channel: string; language: string; created_at: string };
const CHANNELS = ["instagram", "tiktok", "x", "facebook"] as const;
type Channel = (typeof CHANNELS)[number];

export default function MarketingStudio({ book, onDirtyChange }: { book: PortalBook; onDirtyChange: (dirty: boolean) => void }) {
  const [channel, setChannel] = useState<Channel>("instagram");
  const [language, setLanguage] = useState(normalizeLanguage(book.language));
  const [text, setText] = useState("");
  const [savedDraft, setSavedDraft] = useState("");
  const [goal, setGoal] = useState("Introduce the book");
  const [audience, setAudience] = useState("");
  const [dailyBudget, setDailyBudget] = useState("");
  const [currency, setCurrency] = useState("SEK");
  const [days, setDays] = useState("7");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"generate" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [restored, setRestored] = useState(false);
  const recoveryKey = `verkli:marketing-draft:${book.id}`;
  const metadata = { goal, audience, dailyBudget, currency, days };
  const signature = JSON.stringify({ text, channel, language, ...metadata });
  const dirty = !!text && signature !== savedDraft;
  const totalBudget = Number.isFinite(Number(dailyBudget) * Number(days)) && Number(dailyBudget) > 0 && Number.isInteger(Number(days)) && Number(days) > 0 ? Number(dailyBudget) * Number(days) : null;

  // Session-only recovery also covers browser Back/Forward, where neither
  // beforeunload nor an intercepted Link click fires in the App Router.
  useEffect(() => {
    try {
      const draft = JSON.parse(sessionStorage.getItem(recoveryKey) ?? "null");
      if (draft && typeof draft.text === "string" && draft.text.length <= 100000 && CHANNELS.includes(draft.channel) &&
          [draft.language, draft.goal, draft.audience, draft.dailyBudget, draft.currency, draft.days, draft.savedDraft].every(value => typeof value === "string")) {
        setText(draft.text); setChannel(draft.channel); setLanguage(normalizeLanguage(draft.language));
        setGoal(draft.goal); setAudience(draft.audience); setDailyBudget(draft.dailyBudget); setCurrency(draft.currency); setDays(draft.days);
        setSavedDraft(draft.savedDraft); setNotice("Restored this tab’s last draft. Save it to keep it in your material library.");
      }
    } catch { /* Recovery is best-effort; explicit save remains available. */ }
    setRestored(true);
  }, [recoveryKey]);
  useEffect(() => {
    if (!restored) return;
    try { sessionStorage.setItem(recoveryKey, JSON.stringify({ ...JSON.parse(signature), savedDraft })); }
    catch { /* The navigation guard still protects normal links and reloads. */ }
  }, [restored, recoveryKey, signature, savedDraft]);

  useEffect(() => { onDirtyChange(dirty || !!busy); }, [dirty, busy, onDirtyChange]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => { if (dirty || busy) { event.preventDefault(); event.returnValue = ""; } };
    const guardLink = (event: MouseEvent) => {
      if ((!dirty && !busy) || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!link || link.target === "_blank" || link.hasAttribute("download") || link.href === window.location.href || link.getAttribute("href")?.startsWith("#")) return;
      if (!window.confirm(busy ? "Leave while your draft is being processed? The result may not appear here." : "Leave and discard your unsaved marketing draft?")) {
        event.preventDefault(); event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", guard);
    document.addEventListener("click", guardLink, true);
    return () => { window.removeEventListener("beforeunload", guard); document.removeEventListener("click", guardLink, true); };
  }, [dirty, busy]);
  useEffect(() => {
    let active = true;
    fetch(`/api/marketing/assets?bookId=${book.id}`)
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error("Could not load saved material. Your drafts have not been deleted.");
        if (active) { setAssets(data.assets); setLibraryError(null); }
      })
      .catch(reason => { if (active) setLibraryError(reason instanceof Error ? reason.message : "Could not load saved material."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [book.id, reload]);

  async function generate() {
    if (busy || (dirty && !window.confirm("Replace your unsaved text with a new AI draft?"))) return;
    setBusy("generate"); setError(null); setNotice(null);
    const generationId = crypto.randomUUID();
    try { sessionStorage.setItem(recoveryKey, JSON.stringify({ ...JSON.parse(signature), savedDraft, generationId })); } catch { /* Explicit save is available. */ }
    try {
      const response = await fetch(`/api/books/${book.id}/marketing/generate`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel, language, draftOnly: true, brief: { goal, audience } }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : data.message ?? "Could not generate a draft. Your text is still here. Try again.");
      const generatedText = [data.headline, data.caption, data.cta, data.hashtags].filter(Boolean).join("\n\n");
      // Keep a completed response recoverable even if the author navigated back
      // while generation was in flight and this component has unmounted.
      try {
        if (JSON.parse(sessionStorage.getItem(recoveryKey) ?? "null")?.generationId === generationId) {
          sessionStorage.setItem(recoveryKey, JSON.stringify({ text: generatedText, channel, language, ...metadata, savedDraft }));
        }
      } catch { /* Explicit save is still available. */ }
      setText(generatedText);
      setNotice("Draft generated. Edit the wording, then save it to your material library.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not generate a draft."); }
    finally { setBusy(null); }
  }

  async function save() {
    if (!text.trim() || busy) return;
    if (dailyBudget.trim() && totalBudget === null) { setError("Enter a positive daily amount and a whole number of days, or leave the budget blank."); return; }
    setBusy("save"); setError(null); setNotice(null);
    try {
      const response = await fetch("/api/marketing/assets", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId: book.id, channel, language, contentType: "caption", text, metadata }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error("Could not save this draft. Your text is still here. Try again.");
      setAssets(previous => [data, ...previous]); setSavedDraft(signature); setNotice("Saved to your material library.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save."); }
    finally { setBusy(null); }
  }

  return <div className="space-y-6">
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,1fr)]">
      <section className="space-y-5 rounded-2xl border border-border bg-card p-5 sm:p-6" aria-label="Write marketing copy">
        <div><h2 className="text-section-title">Create your first draft</h2><p className="mt-2 text-sm text-muted-foreground">Start with AI or write your own. Nothing is posted to social media.</p></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2 text-sm">Channel<select aria-label="Draft channel" value={channel} onChange={event => setChannel(event.target.value as Channel)} disabled={!!busy} className="input-base w-full">{CHANNELS.map(value => <option key={value} value={value}>{value === "x" ? "X" : value[0].toUpperCase() + value.slice(1)}</option>)}</select></label>
          <label className="space-y-2 text-sm">Language<select aria-label="Draft language" value={language} onChange={event => setLanguage(normalizeLanguage(event.target.value))} disabled={!!busy} className="input-base w-full">{LANGUAGE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2 text-sm">Goal<select aria-label="Marketing goal" value={goal} onChange={event => setGoal(event.target.value)} disabled={!!busy} className="input-base w-full">{["Introduce the book", "Spark curiosity", "Start a reader conversation", "Prepare an ad"].map(value => <option key={value}>{value}</option>)}</select></label>
          <label className="space-y-2 text-sm">Audience <span className="text-muted-foreground">(optional)</span><input aria-label="Intended audience" value={audience} maxLength={500} onChange={event => setAudience(event.target.value)} disabled={!!busy} placeholder="Readers who enjoy…" className="input-base w-full" /></label>
        </div>
        {!book.description?.trim() ? <p className="rounded-xl bg-accent/40 p-3 text-sm text-muted-foreground">Add a book description to give Stella something useful to work with. You can write your own draft below. <Link href={`/author/books/${book.id}`} className="text-accent-foreground underline">Open book</Link></p> : null}
        <Button onClick={generate} disabled={!!busy || !book.description?.trim()} isLoading={busy === "generate"} loadingText="Writing your draft…">Generate AI draft</Button>
        <label htmlFor="marketing-draft" className="block text-sm font-medium">Your draft</label>
        <textarea id="marketing-draft" value={text} onChange={event => { setText(event.target.value); setNotice(null); }} disabled={!!busy} rows={10} maxLength={100000} placeholder="A hook, a few words about your book, and an invitation to the reader…" className="w-full resize-y rounded-xl border border-border bg-background p-4 text-base leading-relaxed focus-visible:outline-2 focus-visible:outline-ring" />
        <details className="rounded-xl border border-border p-4">
          <summary className="cursor-pointer text-sm font-medium">Ad budget plan (optional)</summary>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="text-sm">Daily amount<input aria-label="Daily ad budget" type="number" min="0.01" step="0.01" value={dailyBudget} onChange={event => setDailyBudget(event.target.value)} disabled={!!busy} className="input-base mt-2 w-full" /></label>
            <label className="text-sm">Currency<select aria-label="Budget currency" value={currency} onChange={event => setCurrency(event.target.value)} disabled={!!busy} className="input-base mt-2 w-full">{["SEK", "EUR", "USD", "GBP", "NOK", "DKK"].map(value => <option key={value}>{value}</option>)}</select></label>
            <label className="text-sm">Days<input aria-label="Budget days" type="number" min="1" step="1" value={days} onChange={event => setDays(event.target.value)} disabled={!!busy} className="input-base mt-2 w-full" /></label>
          </div>
          <p className="mt-3 text-sm">{totalBudget !== null ? `Planned total: ${totalBudget.toLocaleString("en-GB", { maximumFractionDigits: 2 })} ${currency}` : "Enter an amount and duration to calculate your plan."}</p>
          <p className="mt-2 text-xs text-muted-foreground">Saved with your draft. No ad is launched and no money is spent.</p>
        </details>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={save} disabled={!!busy || !text.trim() || !dirty} isLoading={busy === "save"}>Save draft</Button>
          <Button variant="ghost" disabled={!text.trim()} onClick={async () => { try { await navigator.clipboard.writeText(text); setNotice("Copied for your private review."); } catch { setError("Could not copy. Select the text and copy it manually."); } }}>Copy text</Button>
          <span className="text-xs text-muted-foreground">{dirty ? "Unsaved changes" : text ? "Saved" : "No draft yet"}</span>
        </div>
        {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
        {notice ? <p role="status" className="text-sm text-accent-foreground">{notice}</p> : null}
      </section>
      <div className="space-y-6">
        <section className="overflow-hidden rounded-2xl border border-border bg-card" aria-label="Draft preview">
          <div className="border-b border-border p-4"><p className="text-sm font-medium">Preview · {channel === "x" ? "X" : channel}</p><p className="mt-1 text-xs text-muted-foreground">Review the content before you save it.</p></div>
          {book.cover_image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={book.cover_image} alt={`Cover of ${book.title}`} className="mx-auto h-48 w-full bg-accent/20 object-contain p-5" />) : null}
          <div className="p-5"><p className="font-medium">{book.title}</p><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">{text || "Your draft will appear here as you write."}</p></div>
        </section>
        <TrailerCard bookId={book.id} bookTitle={book.title ?? "Untitled"} bookDescription={book.description ?? ""} coverImage={book.cover_image} trailerStatus={book.trailer_status ?? null} trailerUrl={book.trailer_url ?? null} isProLocked={false} />
      </div>
    </div>
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-6" aria-label="Saved material">
      <h2 className="text-section-title">Saved material</h2>
      <p className="mt-2 text-sm text-muted-foreground">Reopen a draft to edit it. Saving keeps a new version so you can return to earlier wording.</p>
      {libraryError ? <div role="alert" className="mt-4 text-sm"><p>{libraryError}</p><Button variant="ghost" onClick={() => { setLoading(true); setReload(value => value + 1); }}>Retry loading</Button></div> : loading ? <p role="status" className="mt-4 text-sm text-muted-foreground">Loading saved material…</p> : !assets.length ? <p className="mt-5 rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">No saved material for this book yet. Write a draft above and choose Save draft.</p> : <ul className="mt-5 grid gap-3 md:grid-cols-2">{assets.map(asset => <li key={asset.id}><button type="button" disabled={!!busy} className="w-full rounded-xl border border-border p-4 text-left hover:bg-accent/30" onClick={() => {
        if (dirty && !window.confirm("Open this saved version and replace your unsaved text?")) return;
        const saved = { goal: asset.metadata?.goal ?? "Introduce the book", audience: asset.metadata?.audience ?? "", dailyBudget: asset.metadata?.dailyBudget ?? "", currency: asset.metadata?.currency ?? "SEK", days: asset.metadata?.days ?? "7" };
        const savedChannel = CHANNELS.includes(asset.channel as Channel) ? asset.channel as Channel : "instagram";
        const savedLanguage = normalizeLanguage(asset.language);
        setText(asset.text); setChannel(savedChannel); setLanguage(savedLanguage);
        setGoal(saved.goal); setAudience(saved.audience); setDailyBudget(saved.dailyBudget); setCurrency(saved.currency); setDays(saved.days);
        setSavedDraft(JSON.stringify({ text: asset.text, channel: savedChannel, language: savedLanguage, ...saved })); setNotice("Saved draft opened.");
      }}><span className="text-xs text-muted-foreground">{asset.channel} · {asset.language} · {new Date(asset.created_at).toLocaleDateString("en-GB")}</span><p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm">{asset.text}</p><span className="mt-3 block text-sm font-medium text-accent-foreground">Edit draft →</span></button></li>)}</ul>}
    </section>
  </div>;
}
