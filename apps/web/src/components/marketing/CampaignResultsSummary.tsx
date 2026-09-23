type Props = {
  posts: ReadonlyArray<{ status: string }>;
  testMode?: boolean;
};

/** Post status and editable metadata are not measurement or attribution sources. */
export function CampaignResultsSummary({ posts, testMode = false }: Props) {
  const shared = posts.filter(post => post.status === "posted").length;
  const metrics = [
    { label: "Reach", detail: "No channel measurement source is connected to this campaign." },
    { label: "Link clicks", detail: "Campaign-specific link tracking is not available." },
    { label: "Attributed purchases", detail: "Book sales have not been attributed to this campaign." },
  ];
  return <section aria-label="Campaign results" className="rounded-2xl border border-border bg-card p-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-lg font-medium">Campaign results</h2>
      {testMode ? <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">Synthetic test data</span> : null}
    </div>
    <p className="mt-2 text-sm text-muted-foreground">Measurements are unavailable. An unknown result does not mean zero.</p>
    <dl className="mt-5 grid gap-3 sm:grid-cols-3">
      {metrics.map(metric => <div key={metric.label} className="rounded-xl border border-border p-4">
        <dt className="text-sm font-medium">{metric.label}</dt>
        <dd className="mt-3 text-lg font-medium">Not measured</dd>
        <dd className="mt-2 text-sm text-muted-foreground">{metric.detail}</dd>
      </div>)}
    </dl>
    <p className="mt-4 text-sm text-muted-foreground">
      {posts.length === 0 ? "No campaign posts have been saved yet." : `${shared} of ${posts.length} posts marked as shared — this is manual workflow status, not a verified delivery receipt.`}
    </p>
    {testMode ? <p className="mt-2 text-sm text-muted-foreground">Simulated deliveries do not measure reach, clicks or purchases.</p> : null}
    <details className="mt-4 border-t border-border pt-4 text-sm">
      <summary className="cursor-pointer rounded-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">What can I learn from this campaign?</summary>
      <div className="mt-3 space-y-2 text-muted-foreground">
        <p>Use the calendar to review your copy and track what you marked as shared. Reach and clicks need measurements from the relevant channel or tracked links.</p>
        <p>Book-wide sales alone do not show which campaign led to a purchase. No winning channel or budget change can be inferred from the data shown here.</p>
      </div>
    </details>
  </section>;
}
