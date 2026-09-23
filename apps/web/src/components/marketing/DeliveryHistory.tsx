import type { DeliveryRecord } from "@/lib/marketing/delivery-ledger";

const labels = {
  scheduled: "Scheduled", processing: "In progress — receipt pending", failed: "Failed before sending",
  uncertain: "Unknown result — verification required", simulated: "Simulated — no external post sent",
  published: "Published", cancelled: "Cancelled",
};

/** Read-only projection of server journal records; never accepts metadata receipts. */
export function DeliveryHistory({ deliveries }: { deliveries: DeliveryRecord[] }) {
  return <section className="space-y-4 rounded-2xl border border-border bg-card p-5" aria-label="Delivery history">
    <div><h2 className="text-lg font-medium">Delivery history</h2>
      <p className="mt-1 text-sm text-muted-foreground">Each attempt keeps its approved copy and status history. Reloading does not clear receipts.</p></div>
    {!deliveries.length ? <p className="text-sm text-muted-foreground">No deliveries yet. Approve your copy, then choose a publishing time.</p> :
      [...deliveries].reverse().map(delivery => <article key={delivery.id} className="space-y-3 border-t border-border pt-4">
        <p className="text-sm font-medium">{labels[delivery.state]}</p>
        <p className="text-xs text-muted-foreground">{delivery.channel.toUpperCase()} · {delivery.mode === "simulation" ? "Test transport" : "Connected transport"} · Attempts: {delivery.attempts}</p>
        <p className="text-xs text-muted-foreground">Scheduled for <time dateTime={delivery.scheduledFor}>{new Date(delivery.scheduledFor).toLocaleString("en-GB")}</time></p>
        <p className="whitespace-pre-wrap text-sm">{delivery.text}</p>
        {delivery.state === "uncertain" || delivery.state === "processing" ? <p className="text-sm text-amber-700">Do not resend. Check the transport receipt before taking another action. Automatic retry and cancellation are blocked.</p> : null}
        <ol className="space-y-2 border-l border-border pl-4 text-sm">
          {delivery.events.map((event, index) => <li key={`${delivery.id}-${index}`}>
            <span>{labels[event.state]}</span>{" · "}<time className="text-muted-foreground" dateTime={event.at}>{new Date(event.at).toLocaleString("en-GB")}</time>
          </li>)}
        </ol>
      </article>)}
  </section>;
}
