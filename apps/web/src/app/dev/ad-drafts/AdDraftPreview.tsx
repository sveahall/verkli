"use client";
import { useState } from "react";
import { AdDraftPlanner } from "@/components/marketing/AdDraftPlanner";
import { Button } from "@/components/ui/button";
import type { SavedAdDraft } from "@/lib/marketing/ad-draft";
import type { AdDraftsClient } from "@/lib/marketing/ad-drafts-client";
function createFixture() {
  const drafts = new Map<string, SavedAdDraft>();
  let failure: "failure" | "conflict" | null = null;
  let revision = 0;
  const client: AdDraftsClient = {
    async list() { return { books: [{ id: "11111111-1111-4111-8111-111111111111", title: "Synthetic Ocean" }], drafts: structuredClone([...drafts.values()]) }; },
    async save(bookId, draft, current) {
      const selectedFailure = failure; failure = null;
      if (selectedFailure === "failure") throw new Error("Synthetic save failed. Your text is still here. Reload saved drafts before retrying.");
      if (selectedFailure === "conflict") throw new Error("This draft changed elsewhere. Your text is still here. Reload the saved list before continuing.");
      if (current && drafts.get(current.id)?.updatedAt !== current.updatedAt) throw new Error("This draft changed elsewhere. Reload the saved list.");
      const saved = { id: current?.id ?? crypto.randomUUID(), bookId, draft: structuredClone(draft), updatedAt: new Date(Date.UTC(2026, 8, 23) + ++revision * 1000).toISOString() };
      drafts.set(saved.id, saved); return structuredClone(saved);
    },
  };
  return { client, failNext: (kind: "failure" | "conflict") => { failure = kind; } };
}
export default function AdDraftPreview() {
  const [fixture] = useState(createFixture);
  const [notice, setNotice] = useState("");
  return <main className="mx-auto max-w-6xl space-y-5 p-6"><p className="text-sm text-muted-foreground">Local test session. Reloading this page clears synthetic drafts. The real author page saves through the protected server API.</p><div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => { fixture.failNext("failure"); setNotice("Next save will simulate a storage failure."); }}>Fail next save</Button><Button variant="secondary" onClick={() => { fixture.failNext("conflict"); setNotice("Next save will simulate a conflict."); }}>Conflict on next save</Button></div><p role="status" className="text-sm">{notice}</p><AdDraftPlanner client={fixture.client} testMode /></main>;
}
