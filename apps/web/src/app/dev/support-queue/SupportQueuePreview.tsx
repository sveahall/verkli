"use client";

import { useMemo, useRef, useState } from "react";
import FeedbackQueue, { type FeedbackRow, type QueueApi } from "@/app/admin/feedback/FeedbackQueue";
import { Button } from "@/components/ui/button";

function fixtureRows(): FeedbackRow[] {
  return Array.from({ length: 106 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    user_id: index % 4 === 2 ? null : `demo-user-${index + 1}`,
    auth_email: index % 4 === 1 ? null : `reader${index + 1}@example.test`,
    type: ["bug", "idea", "other"][index % 3],
    status: ["new", "triaged", "done"][index % 3],
    message: index === 2 ? "Reply to: guest@example.test\nI need help accessing my book." : `Support request ${index + 1}: ${index % 3 === 0 ? "The audiobook stops after chapter two." : index % 3 === 1 ? "Could I organize my reading list?" : "Please help me find my purchase."}`,
    url: index === 0 ? `https://example.test/reader/read/${"long-context-".repeat(15)}` : "/reader/library",
    request_id: `demo-request-${index + 1}`,
    created_at: new Date(Date.UTC(2026, 8, 16, 12, 0, -index)).toISOString(),
  }));
}

export default function SupportQueuePreview() {
  const rows = useRef(fixtureRows());
  const nextLoad = useRef<"ok" | "fail" | "slow">("ok");
  const nextSave = useRef<"ok" | "fail" | "conflict">("ok");
  const [notice, setNotice] = useState("106 sample requests. No requests or emails are sent.");
  const queueApi = useMemo<QueueApi>(() => ({
    async load(page, status) {
      const mode = nextLoad.current;
      nextLoad.current = "ok";
      const filtered = rows.current.filter((row) => status === "all" || row.status === status);
      // Capture before the delay and intentionally ignore abort: this exercises
      // the real queue's response-order guard even with an uncancellable source.
      const data = { feedback: filtered.slice((page - 1) * 50, page * 50).map((row) => ({ ...row })), total: filtered.length, page, pageSize: 50 };
      await new Promise((resolve) => setTimeout(resolve, mode === "slow" ? 1500 : 100));
      if (mode === "fail") throw new Error("The support service is unavailable. Please try again.");
      return data;
    },
    async save(id, status, expectedStatus) {
      const mode = nextSave.current;
      nextSave.current = "ok";
      await new Promise((resolve) => setTimeout(resolve, 100));
      const row = rows.current.find((item) => item.id === id);
      if (!row) throw new Error("This item no longer exists. Reload the queue.");
      if (mode === "fail") throw new Error("The support service is unavailable. Please reload the queue before trying again.");
      if (mode === "conflict") row.status = "triaged";
      if (row.status !== expectedStatus) throw new Error("This item was changed by another administrator. Reload the queue before saving again.");
      row.status = status;
      return { id, status };
    },
  }), []);

  return <main className="min-w-0">
    <div className="page-content pt-6">
      <p className="text-label mb-3">Support queue · local demo</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => { nextLoad.current = "fail"; setNotice("Next load will fail. Select Refresh."); }}>Fail next load</Button>
        <Button variant="secondary" size="sm" onClick={() => { nextLoad.current = "slow"; setNotice("Next load takes 1.5 seconds. Change pages, then change the filter."); }}>Delay next load</Button>
        <Button variant="secondary" size="sm" onClick={() => { nextSave.current = "conflict"; setNotice("Next save simulates another administrator triaging that request."); }}>Conflict next save</Button>
        <Button variant="secondary" size="sm" onClick={() => { nextSave.current = "fail"; setNotice("Next save will fail without changing the request."); }}>Fail next save</Button>
        <Button variant="secondary" size="sm" onClick={() => { rows.current = []; setNotice("Queue is empty. Select Refresh."); }}>Empty queue</Button>
        <Button variant="secondary" size="sm" onClick={() => { rows.current = fixtureRows(); nextLoad.current = "ok"; nextSave.current = "ok"; setNotice("Sample requests reset. Select Refresh."); }}>Reset sample data</Button>
      </div>
      <p className="text-caption mt-3" aria-live="polite">{notice}</p>
    </div>
    <FeedbackQueue queueApi={queueApi} />
  </main>;
}
