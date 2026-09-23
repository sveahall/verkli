"use client";

import { useCallback, useEffect, useState } from "react";
import { PostDrawer } from "@/features/author-workspaces/marketing/CampaignDetailView";
import { CampaignResultsSummary } from "@/components/marketing/CampaignResultsSummary";
import { DeliveryHistory } from "@/components/marketing/DeliveryHistory";
import { Button } from "@/components/ui/button";
import type { LocalDeliveryView } from "@/lib/marketing/local-delivery-types";

/** Same journal state machine as the protected adapter; only local test transport is wired. */
export default function CampaignDeliveryPreview() {
  const [view, setView] = useState<LocalDeliveryView | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState("success");
  const request = useCallback(async (body?: Record<string, unknown>) => {
    const response = await fetch("/api/dev/campaign-delivery", body ? {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify(body),
    } : { cache: "no-store", credentials: "same-origin" });
    const data = await response.json() as LocalDeliveryView & { detail?: string };
    if (!response.ok) throw new Error(data.detail ?? "Could not load delivery history. Try again.");
    setError(null); setView(data); return data;
  }, []);
  useEffect(() => { let mounted = true; request().catch(reason => { if (mounted) setError(reason.message); }); return () => { mounted = false; }; }, [request]);
  const run = async (body?: Record<string, unknown>) => {
    if (busy) return;
    setBusy(true); setError(null);
    try { await request(body); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update delivery."); }
    finally { setBusy(false); }
  };
  const current = view?.deliveries.at(-1);
  return <main className="mx-auto max-w-3xl space-y-5 p-6">
    <header className="space-y-2">
      <p className="text-eyebrow">Local development · test transport</p>
      <h1 className="text-2xl font-semibold">Campaign delivery</h1>
      <p className="text-sm text-muted-foreground">Approve → schedule → inspect the receipt. This fixture sends no social posts, emails or paid requests. Its server-owned history survives reloads and local server restarts.</p>
      <p className="text-sm text-muted-foreground">Live scheduling remains unavailable until the protected database schema and transport are approved. This local journal is not a production database.</p>
    </header>
    {error ? <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
    <div className="flex flex-wrap gap-3">
      <Button onClick={() => setOpen(true)} disabled={!view || busy}>Review local post</Button>
      <Button variant="ghost" onClick={() => run()} isLoading={busy}>Reload saved history</Button>
      <Button variant="ghost" onClick={() => run({ action: "new", expectedUpdatedAt: view?.post.updatedAt })} disabled={!view || busy || !!current && ["scheduled", "processing", "uncertain", "failed"].includes(current.state)}>New test post</Button>
    </div>
    {!view && !error ? <p role="status">Loading saved delivery history…</p> : null}
    {view ? <>
      <section className="space-y-3 rounded-2xl border border-border bg-card p-5" aria-label="Test transport controls">
        <h2 className="text-lg font-medium">Run the local transport</h2>
        <p className="text-sm text-muted-foreground">Only due deliveries are processed. A future schedule stays queued until its selected time. This button is a local worker probe.</p>
        <label htmlFor="transport-outcome" className="block text-sm">Test outcome</label>
        <select id="transport-outcome" value={outcome} onChange={event => setOutcome(event.target.value)} className="w-full rounded-lg border border-border bg-background p-2 text-sm">
          <option value="success">Successful simulation</option><option value="failure">Confirmed failure before sending</option><option value="uncertain">Unknown transport result</option>
        </select>
        <Button variant="ghost" onClick={() => run({ action: "consume", outcome })} disabled={busy || current?.state !== "scheduled"}>Process due simulation</Button>
        <p role="status" className="text-sm">Post: {view.post.status} · Delivery: {current?.state ?? "not scheduled"} · External posts: 0</p>
      </section>
      <DeliveryHistory deliveries={view.deliveries} />
      <CampaignResultsSummary posts={[view.post]} testMode />
    </> : null}
    {open && view ? <PostDrawer key={view.post.id} post={view.post} allowManualSharing={false} deliveryReadOnly={!!current && ["failed", "simulated"].includes(current.state)}
      deliveryDescription="Local server journal and test transport only. No subscription, connected account or external delivery is used. Approved copy and receipts are stored by the local server." onClose={() => setOpen(false)}
      onReload={async () => (await request()).post} onGenerateTrailer={async () => {}}
      onUpdate={async (_id, body) => {
        if (body.status && body.status !== "ready") throw new Error("This fixture records delivery receipts. Manual posted/skip actions are unavailable.");
        const saved = await request({ action: body.status === "ready" ? "approve" : "edit", expectedUpdatedAt: body.expectedUpdatedAt, caption: body.caption ?? view.post.caption, hashtags: body.hashtags ?? view.post.hashtags });
        return saved.post;
      }} onDelivery={async (_id, body) => (await request(body)).post} /> : null}
  </main>;
}
