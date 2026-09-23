"use client";

import { useState } from "react";
import { NewsletterAudienceSummary } from "@/components/newsletters/NewsletterAudienceSummary";

export default function NewsletterAudiencePreview() {
  const [scenario, setScenario] = useState("active");
  const count = scenario === "active" ? 12 : scenario === "empty" ? 0 : null;
  return <main className="mx-auto w-full max-w-3xl space-y-6 px-6 py-8">
    <header className="space-y-2">
      <p className="text-sm text-muted-foreground">Local development · synthetic audience</p>
      <h1 className="text-3xl font-medium">Review newsletter recipients</h1>
      <p className="text-sm text-muted-foreground">Try the draft audience review with sample data. This page does not load subscribers, save drafts or send emails.</p>
    </header>
    <div className="space-y-2">
      <label htmlFor="audience-scenario" className="block text-sm font-medium">Sample audience</label>
      <select id="audience-scenario" value={scenario} onChange={event => setScenario(event.target.value)} className="min-h-11 w-full rounded-xl border border-border bg-card px-3 text-sm">
        <option value="active">12 active subscriptions</option>
        <option value="empty">No active subscribers</option>
        <option value="unavailable">Count unavailable</option>
      </select>
    </div>
    <NewsletterAudienceSummary activeCount={count} testMode />
  </main>;
}
