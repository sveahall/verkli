"use client";
import { useState } from "react";
import FullBookAudioExport from "@/features/audiobook/FullBookAudioExport";
export default function Fixture() {
  const [scenario, setScenario] = useState("complete");
  return <main className="mx-auto max-w-4xl space-y-6 p-6"><label className="block text-sm">Source scenario<select className="ml-3 min-h-11 rounded-xl border border-border bg-background p-2" value={scenario} onChange={(event) => setScenario(event.target.value)}>{["complete", "source-changed", "encoder-error", "missing", "denied"].map((value) => <option key={value}>{value}</option>)}</select></label><FullBookAudioExport bookId="00000000-0000-4000-8000-000000000002" editionId="00000000-0000-4000-8000-000000000003" endpoint={`/api/dev/full-book-audio-export?scenario=${scenario}`} synthetic /></main>;
}
