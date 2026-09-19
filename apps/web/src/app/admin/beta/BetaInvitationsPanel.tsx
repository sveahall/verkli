"use client";

import { useCallback, useEffect, useState } from "react";
import { Mail, RefreshCw, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SearchInput } from "@/components/ui/input";
import type { BetaRecipient } from "@/lib/admin/beta-invitations";

type Model = { recipients: BetaRecipient[]; allowance: { remaining: number; limit: number }; hasMore: boolean };
export default function BetaInvitationsPanel({ request = fetch }: { request?: (url: string, init?: RequestInit) => Promise<Response> }) {
  const [data, setData] = useState<Model | null>(null);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [selected, setSelected] = useState<BetaRecipient | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [source, setSource] = useState<"waitlist" | "accounts">("waitlist");
  const [accounts, setAccounts] = useState<BetaRecipient[]>([]);
  const [accountQuery, setAccountQuery] = useState("");
  const [accountPage, setAccountPage] = useState(1);
  const [accountHasMore, setAccountHasMore] = useState(false);
  const load = useCallback(async () => {
    try {
      const res = await request(`/api/admin/beta-invitations?page=${page}`, { cache: "no-store" });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Invitations could not be loaded.");
      setData(payload); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Invitations could not be loaded."); }
  }, [page, request]);
  useEffect(() => { void load(); }, [load]);
  async function searchAccounts(nextPage = 1) {
    setError("");
    try {
      const res = await request(`/api/admin/users?q=${encodeURIComponent(accountQuery)}&page=${nextPage}&includeDelivery=true`, { cache: "no-store" });
      const payload = await res.json();
      if (!res.ok) throw new Error("Accounts could not be loaded.");
      setAccountPage(nextPage); setAccountHasMore(payload.total > nextPage * payload.limit);
      setAccounts(payload.users.filter((u: { email: string | null }) => u.email).map((u: { user_id: string; email: string; beta_enabled: boolean; deliveryState: string }) => ({ id: u.user_id, email: u.email, source: "user", invitedAt: u.beta_enabled ? "enabled" : null, deliveryState: u.deliveryState })));
    } catch { setError("Accounts could not be loaded. Try again."); }
  }
  async function send(recipient: BetaRecipient) {
    const key = `${recipient.source}:${recipient.id}`;
    setBusy(key); setError("");
    try {
      const res = await request("/api/admin/beta-invitations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: recipient.id, source: recipient.source }) });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Invitation could not be prepared.");
      setMessages(current => ({ ...current, [key]: payload.delivery.message }));
      setSelected(null); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Invitation could not be prepared."); }
    finally { setBusy(null); }
  }
  const rows = source === "accounts" ? accounts : (data?.recipients ?? []).filter(r => r.email.toLowerCase().includes(query.toLowerCase()));
  return <Card className="mt-8 p-5 sm:p-7">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><div className="mb-2 flex items-center gap-2 text-accent-foreground"><Mail size={18} /><span className="text-sm font-medium">A personal welcome</span></div>
        <h2 className="text-xl font-display">Invite your next beta tester</h2>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">Choose one person. We enable their access first, then send the right steps for their account.</p>
      </div>
      <div className="rounded-xl bg-muted px-4 py-3 text-sm"><strong>{data ? `${data.allowance.remaining} of ${data.allowance.limit}` : "Checking…"}</strong><p className="text-muted-foreground">invitation attempts left today · UTC</p></div>
    </div>
    <p className="mt-3 text-xs text-muted-foreground">This invitation budget is separate from password resets, receipts and your Resend account quota. Provider acceptance does not confirm inbox delivery.</p>
    <div className="my-5 flex flex-wrap gap-2">
      <Button size="sm" variant={source === "waitlist" ? "primary" : "secondary"} onClick={() => { setSource("waitlist"); setSelected(null); }}>Waiting list</Button>
      <Button size="sm" variant={source === "accounts" ? "primary" : "secondary"} onClick={() => { setSource("accounts"); setSelected(null); }}>Existing accounts</Button>
      <Button size="sm" variant="ghost" onClick={() => void load()} aria-label="Refresh invitations"><RefreshCw size={16} /></Button>
    </div>
    {source === "waitlist" ? <SearchInput aria-label="Filter this page by email" placeholder="Filter this page by email…" value={query} onChange={e => setQuery(e.target.value)} /> : <form className="flex gap-2" onSubmit={e => { e.preventDefault(); void searchAccounts(); }}><SearchInput aria-label="Find account by name" placeholder="Search by display name or username…" value={accountQuery} onChange={e => setAccountQuery(e.target.value)} /><Button type="submit" variant="secondary">Find accounts</Button></form>}
    {error && <p role="alert" className="my-4 text-sm text-destructive">{error}</p>}
    {!data && !error && <p role="status" className="py-6 text-sm text-muted-foreground">Loading invitation lists…</p>}
    {data && rows.length === 0 && <p className="py-6 text-sm text-muted-foreground">{source === "accounts" ? "Find an existing account to send its sign-in instructions." : "No matching people on this page. Try another page or clear the filter."}</p>}
    <ul className="mt-4 max-h-[32rem] divide-y divide-border overflow-y-auto">
      {rows.map(r => { const key = `${r.source}:${r.id}`; return <li key={key} className="py-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><p className="break-all text-sm font-medium">{r.email}</p><p className="mt-1 text-xs text-muted-foreground">{r.source === "author_waitlist" ? "Author" : r.source === "reader_waitlist" ? "Reader" : "Existing account"} · {r.invitedAt ? "Access reserved" : "Waiting for access"}</p></div>
          <Button size="sm" variant="secondary" disabled={Boolean(busy)} onClick={() => setSelected(r)}>Prepare welcome <ArrowRight size={14} /></Button></div>
        {(messages[key] || r.deliveryState) && <p role="status" className="mt-3 text-sm">{messages[key] || r.deliveryState}</p>}
      </li>; })}
    </ul>
    {source === "waitlist" && <div className="mt-4 flex items-center gap-3"><Button size="sm" variant="secondary" disabled={page <= 1 || Boolean(busy)} onClick={() => { setPage(p => p - 1); setSelected(null); }}>Previous</Button><span className="text-sm">Page {page}</span><Button size="sm" variant="secondary" disabled={!data?.hasMore || Boolean(busy)} onClick={() => { setPage(p => p + 1); setSelected(null); }}>Next</Button></div>}
    {source === "accounts" && accounts.length > 0 && <div className="mt-4 flex gap-3"><Button size="sm" variant="secondary" disabled={accountPage <= 1} onClick={() => void searchAccounts(accountPage - 1)}>Previous accounts</Button><span>Page {accountPage}</span><Button size="sm" variant="secondary" disabled={!accountHasMore} onClick={() => void searchAccounts(accountPage + 1)}>Next accounts</Button></div>}
    {selected && <div className="mt-5 rounded-xl border border-border bg-muted p-5" role="region" aria-label="Confirm invitation">
      <h3 className="font-medium">Welcome {selected.email}</h3><p className="my-3 text-sm text-muted-foreground">This enables beta access and sends one welcome email. Previous successful welcomes are never sent twice. If delivery fails, their access remains enabled and you can retry here.</p>
      <div className="flex flex-wrap gap-2"><Button isLoading={Boolean(busy)} disabled={Boolean(busy) || !data || data.allowance.remaining === 0} onClick={() => void send(selected)}>Enable access &amp; send welcome</Button><Button variant="secondary" disabled={Boolean(busy)} onClick={() => setSelected(null)}>Cancel</Button></div>
    </div>}
  </Card>;
}
