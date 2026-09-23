"use client";
import { useEffect, useRef, useState } from "react";
import ImportJobLookup from "@/app/admin/queues/ImportJobLookup";
import { ImportBookModal } from "@/components/import/ImportBookModal";
import type { ImportDiagnostic } from "@/lib/queues/import-diagnostics";
const id = "11111111-1111-4111-8111-111111111111";
const base: ImportDiagnostic = { id, status: "pending", progress: 0, createdAt: "2026-09-22T10:00:00Z", updatedAt: "2026-09-22T10:00:00Z", queue: { availability: "available", state: "waiting", attemptsMade: 0 } };
export default function ImportDiagnosticsPreview() {
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [scenario, setScenario] = useState("queued");
  const currentScenario = useRef(scenario);
  const slow = useRef(false);
  useEffect(() => {
    const original = window.fetch;
    window.fetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), location.origin);
      const method = init?.method ?? (input instanceof Request ? input.method : "GET");
      if (url.origin === location.origin && url.pathname === "/api/books/imports" && method === "GET") {
        const status = ["completed", "failed"].includes(currentScenario.current) ? currentScenario.current : "pending";
        return Response.json({ imports: [{ id, file_name: "Synthetic example.txt", status, progress: status === "completed" ? 100 : 0, error: status === "failed" ? "Local example failure." : null, book_id: null, created_at: base.createdAt }] });
      }
      if (url.origin !== location.origin || url.pathname.startsWith("/api/") || !["GET", "HEAD"].includes(method)) return Response.json({ error: "Local fixture only. No upload or worker was started." }, { status: 403 });
      return original(input, init);
    };
    const timer = setTimeout(() => setReady(true), 0);
    return () => { clearTimeout(timer); window.fetch = original; };
  }, []);
  return <main className="mx-auto max-w-4xl p-4 sm:p-8">
    <h1 className="text-2xl font-semibold">Import diagnostics · local fixture</h1>
    <p className="my-3 text-sm text-muted-foreground">Synthetic status only. No file import, database, Redis or provider calls. Reference: <code>{id}</code></p>
    <div className="flex flex-wrap items-center gap-3">
      <label>Fixture state <select className="min-h-11 rounded-lg border border-border bg-background px-3" value={scenario} onChange={(event) => { currentScenario.current = event.target.value; setScenario(event.target.value); }}>{["queued", "extracting", "running", "completed", "failed", "missing", "unavailable", "mismatch", "reverse-mismatch", "error"].map((value) => <option key={value}>{value}</option>)}</select></label>
      <button className="btn-secondary min-h-11" onClick={() => { slow.current = true; }}>Delay next lookup</button>
      <button className="btn-secondary min-h-11" disabled={!ready} onClick={() => setOpen(true)}>Author import status</button>
    </div>
    <ImportJobLookup lookup={async (reference) => {
      const state = scenario;
      const delay = slow.current; slow.current = false;
      await new Promise((resolve) => setTimeout(resolve, delay ? 1500 : 100));
      if (state === "error") throw new Error("Import diagnostics are unavailable. Try again.");
      if (reference !== id) throw new Error("No import found for this reference.");
      if (state === "missing" || state === "unavailable") return { ...base, queue: { availability: state, state: null, attemptsMade: null } };
      if (state === "reverse-mismatch") return { ...base, status: "completed", progress: 100, queue: { availability: "available", state: "active", attemptsMade: 1 } };
      if (state === "mismatch") return { ...base, queue: { availability: "available", state: "completed", attemptsMade: 2 } };
      const status = state === "queued" ? "pending" : state === "running" ? "processing" : state;
      return { ...base, status, progress: state === "completed" ? 100 : ["extracting", "running"].includes(state) ? 50 : 0,
        queue: { availability: "available", state: state === "queued" ? "waiting" : ["extracting", "running"].includes(state) ? "active" : state, attemptsMade: ["completed", "failed"].includes(state) ? 2 : 0 } };
    }} />
    {ready && <ImportBookModal open={open} onClose={() => setOpen(false)} />}
  </main>;
}
