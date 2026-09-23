type Props = {
  activeCount: number | null;
  testMode?: boolean;
};

export function NewsletterAudienceSummary({ activeCount, testMode = false }: Props) {
  return <section aria-label="Newsletter audience" className="rounded-2xl border border-border bg-card p-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-lg font-medium">Who is this draft for?</h2>
      {testMode ? <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">Synthetic test data</span> : null}
    </div>
    <p className="mt-3 text-sm font-medium">All active subscribers</p>
    <p className="mt-1 text-sm text-muted-foreground">
      {activeCount === null ? "Count unavailable. Reload this draft to try again; you can still edit and save it."
        : activeCount === 0 ? "No active subscribers yet. You can prepare and save your draft."
          : `${activeCount.toLocaleString("en-US")} active ${activeCount === 1 ? "subscription" : "subscriptions"} at page load.`}
    </p>
    <p className="mt-3 text-sm text-muted-foreground">The final recipient count can change. This is a subscription snapshot, not a delivery receipt.</p>
    <p className="mt-2 text-sm text-muted-foreground">Readers who already unsubscribed are excluded when the recipient list is loaded. A personal unsubscribe link is added to each email.</p>
    <details className="mt-4 border-t border-border pt-4 text-sm">
      <summary className="cursor-pointer rounded-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">Unsubscribe preview</summary>
      <p className="mt-3 text-xs text-muted-foreground">Preview only. The personal link is created for each recipient when sending.</p>
      <div className="mt-3 rounded-xl border border-border p-4 text-sm text-muted-foreground">
        You received this email because you subscribed to this author&apos;s newsletter. <span className="underline">Unsubscribe</span>.
      </div>
    </details>
  </section>;
}
