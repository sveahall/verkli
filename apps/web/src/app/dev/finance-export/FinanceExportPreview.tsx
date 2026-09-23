"use client";

import { useEffect, useState, type ReactNode } from "react";
import shellStyles from "@/features/author-shell/AuthorAppShell.module.css";
import ReadingDataExport from "@/components/reader/ReadingDataExport";

const STATES = ["history", "zero", "empty", "failure", "test-mode", "not-connected", "onboarding"];

export default function FinanceExportPreview({ state, locale, csv, children }: {
  state: string; locale: string; csv: string; children: ReactNode;
}) {
  const [reportState, setReportState] = useState("ready");
  const [exportState, setExportState] = useState("ready");
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), location.origin);
      if (url.origin === location.origin && url.pathname === "/api/billing/connect/payout-report") {
        await new Promise((resolve) => setTimeout(resolve, 700));
        if (reportState === "failure") return Response.json({ error: "FIXTURE_ERROR" }, { status: 503 });
        if (reportState === "signed-out") return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
        return new Response(csv, { headers: { "Content-Type": "text/csv;charset=utf-8" } });
      }
      if (url.origin === location.origin && url.pathname === "/api/reader/export") {
        await new Promise((resolve) => setTimeout(resolve, 700));
        if (exportState === "failure") return Response.json({ error: "FIXTURE_ERROR" }, { status: 500 });
        if (exportState === "signed-out") return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
        if (exportState === "too-large") return Response.json({ error: "READING_EXPORT_TOO_LARGE" }, { status: 413 });
        return Response.json({
          schemaVersion: 1, scope: "reading-data", synthetic: true,
          exportedAt: new Date().toISOString(),
          coverage: { maxRowsPerList: 10000, truncated: false, consistency: "Synthetic fixture only" },
          account: { id: "synthetic-reader", email: "reader@example.invalid" },
          readingPreferences: { settings: { theme: "dark" } },
          bookmarks: [], readingProgress: [], listeningProgress: [],
        });
      }
      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      if (url.origin !== location.origin || url.pathname.startsWith("/api/") || !["GET", "HEAD"].includes(method)) {
        return Response.json({ error: "PREVIEW_ONLY" }, { status: 403 });
      }
      return originalFetch(input, init);
    };
    const timer = window.setTimeout(() => setReady(true), 0);
    return () => { window.clearTimeout(timer); window.fetch = originalFetch; };
  }, [exportState, reportState, csv]);

  return <div onSubmitCapture={(event) => {
    event.preventDefault(); setMessage("Synthetic onboarding selected. No account was created.");
  }} onClickCapture={(event) => {
    const anchor = (event.target as HTMLElement).closest("a");
    if (!anchor) return;
    const url = new URL(anchor.href, location.origin);
    if (url.pathname === "/author/billing/payouts") {
      event.preventDefault(); location.href = `/dev/finance-export?state=history&locale=${locale}`;
    } else if (url.pathname.startsWith("/api/")) {
      event.preventDefault(); setMessage("Synthetic onboarding selected. No Stripe call was made.");
    }
  }}>
    <section aria-label="Finance export preview controls" className="flex flex-wrap items-center gap-3 border-b border-border bg-muted px-4 py-3 text-xs">
      <label className="flex min-h-11 items-center gap-2">Payout state<select className="min-h-11 rounded border border-border bg-background px-2" value={state} onChange={(event) => { location.href = `/dev/finance-export?state=${event.target.value}&locale=${locale}`; }}>
        {STATES.map((value) => <option key={value}>{value}</option>)}
      </select></label>
      <label className="flex min-h-11 items-center gap-2">Payout language<select className="min-h-11 rounded border border-border bg-background px-2" value={locale} onChange={(event) => { location.href = `/dev/finance-export?state=${state}&locale=${event.target.value}`; }}>
        <option value="en">English</option><option value="sv">Svenska</option>
      </select></label>
      <label className="flex min-h-11 items-center gap-2">CSV state<select className="min-h-11 rounded border border-border bg-background px-2" value={reportState} onChange={(event) => setReportState(event.target.value)}>
        {["ready", "failure", "signed-out"].map((value) => <option key={value}>{value}</option>)}
      </select></label>
      <button type="button" className="min-h-11 px-3" onClick={() => document.querySelector<HTMLButtonElement>('[data-theme-toggle="global"]')?.click()}>Toggle theme</button>
      <p>Synthetic fixture · no accounts, payments or provider calls</p>
      {message && <p role="status">{message}</p>}
    </section>
    {ready ? <div className={shellStyles.shell}>{children}</div> : <p role="status" className="p-6">Preparing local preview…</p>}
    <div className="mx-auto max-w-4xl px-6 pb-10">
      <label className="flex min-h-11 items-center gap-2 text-xs">Export state<select className="min-h-11 rounded border border-border bg-background px-2" value={exportState} onChange={(event) => setExportState(event.target.value)}>
        {["ready", "failure", "signed-out", "too-large"].map((value) => <option key={value}>{value}</option>)}
      </select></label>
      {ready && <ReadingDataExport key={exportState} />}
    </div>
  </div>;
}
