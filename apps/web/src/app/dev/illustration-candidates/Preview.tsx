"use client";
import { useEffect, useState } from "react";
import CandidatePanel from "@/features/illustration-candidates/CandidatePanel";
import { createCandidateFixture } from "./fixture";

export default function Preview() {
  const [fixture] = useState(createCandidateFixture);
  const [chapter, setChapter] = useState(0);
  const [hint, setHint] = useState("");
  useEffect(() => { fixture.activate(); return () => fixture.dispose(); }, [fixture]);
  return <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-8">
    <div className="mx-auto mb-6 max-w-6xl space-y-4 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm"><p><strong>Local demo — simulated saving only.</strong> Images stay in this browser session and disappear on page reload. No database, storage or AI calls.</p>
      {fixture && <div className="flex flex-wrap items-center gap-3"><label>Demo chapter<select className="ml-2 rounded-lg border bg-background p-2" value={chapter} onChange={(event) => { setChapter(Number(event.target.value)); setHint(""); }}>{fixture.chapters.map((item, index) => <option key={item.id} value={index}>{item.title}</option>)}</select></label>
        <button className="rounded-lg border p-2" onClick={() => { fixture.failNext(); setHint("The next save will simulate unavailable private storage."); }}>Fail next save</button>
        <button className="rounded-lg border p-2" onClick={() => { fixture.advance(chapter); setHint("Text advanced. Reload candidates to compare the source version."); }}>Advance text version</button>
        <label className="flex items-center gap-2"><input type="checkbox" onChange={(event) => fixture.delay(event.target.checked)} />Delay saves</label>
      </div>}{hint && <p>{hint}</p>}
    </div>
    {fixture ? <CandidatePanel adapter={fixture.adapters[chapter]} /> : <p role="status" className="mx-auto max-w-6xl">Loading local demo…</p>}
  </main>;
}
