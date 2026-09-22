"use client";
import { useMemo, useState } from "react";
import PronunciationEditor from "@/features/audiobook/PronunciationEditor";
import { createFixtureAdapter, type FixtureMode } from "./fixture-adapter";

export default function PronunciationFixture() {
  const [owner, setOwner] = useState("author-one");
  const [edition, setEdition] = useState("en");
  const [mode, setMode] = useState<FixtureMode>("normal");
  const [reload, setReload] = useState(0);
  const [fixture] = useState(() => {
    let currentMode: FixtureMode = "normal";
    return { adapter: createFixtureAdapter(() => currentMode), setMode: (value: FixtureMode) => { currentMode = value; } };
  });
  const scope = useMemo(() => ({ ownerId: owner, bookId: "synthetic-book", editionId: edition }), [owner, edition]);
  const control = "min-h-11 rounded-lg border border-border bg-background px-3 py-2 text-sm";
  return <>
    <div className="border-b border-border bg-muted/50 px-4 py-4">
      <div className="mx-auto max-w-6xl space-y-3">
        <p className="text-xs font-medium uppercase tracking-wider">Local pronunciation demo</p>
        <div className="flex flex-wrap items-end gap-4">
          <label className="grid gap-1 text-xs">Demo author<select className={control} aria-label="Demo author" value={owner} onChange={(event) => setOwner(event.target.value)}><option value="author-one">Author one</option><option value="author-two">Author two</option></select></label>
          <label className="grid gap-1 text-xs">Edition<select className={control} aria-label="Edition" value={edition} onChange={(event) => setEdition(event.target.value)}><option value="en">English</option><option value="sv">Swedish</option></select></label>
          <label className="grid gap-1 text-xs">Simulated response<select className={control} aria-label="Simulated response" value={mode} onChange={(event) => { const value = event.target.value as FixtureMode; fixture.setMode(value); setMode(value); }}><option value="normal">Success</option><option value="save-error">Save fails</option><option value="load-error">Load fails</option><option value="conflict">Another writer saves first</option><option value="delayed">Slow response</option></select></label>
          <button className={control} onClick={() => setReload((value) => value + 1)}>Reload saved demo rules</button>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">Synthetic manuscript and session memory only. Refreshing this page clears all saved demo rules. Switching author or edition, or reloading rules, discards the current draft. No database, speech or manuscript changes.</p>
      </div>
    </div>
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-12"><PronunciationEditor key={reload} adapter={fixture.adapter} scope={scope} editionLabel={edition === "en" ? "English edition" : "Swedish edition"} manuscript={edition === "en" ? "Mira arrived at Mira Bay. Mira said, “Meet me at $x.”" : "Mira kom till Mira Bay. Hon väntade vid kajen."} /></main>
  </>;
}
