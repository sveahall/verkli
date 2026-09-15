"use client";

import { useState } from "react";
import BookCoverWorkspace from "@/features/book-production/BookCoverWorkspace";

export default function WorkspacePreview() {
  const [open, setOpen] = useState(true);
  const [edition, setEdition] = useState("english");
  return <main className="@container/book-panel mx-auto w-full max-w-[1440px] p-6 text-foreground">
    <div className="mb-6 flex flex-wrap gap-4">
      <button className="min-h-11 rounded-full border px-5" onClick={() => setOpen(!open)}>{open ? "Leave cover" : "Return to cover"}</button>
      <label>Fixture edition<select className="ml-3 min-h-11 rounded-lg border p-2" value={edition} onChange={(event) => setEdition(event.target.value)}><option value="english">English</option><option value="swedish">Swedish</option></select></label>
    </div>
    {open ? <BookCoverWorkspace key={edition} ownerId="local-qa-author" bookId="local-qa-book" versionId={edition} title="Local QA edition" author="Alex Morgan" chapters={[{ id: "chapter-1", title: "The crossing", content: "The harbour was quiet.", order: 1 }]} onOpenWriting={() => setOpen(false)}><p className="py-12">Existing digital cover panel — integration fixture.</p></BookCoverWorkspace> : <p>The cover workspace is unmounted. Return to verify draft recovery.</p>}
  </main>;
}
