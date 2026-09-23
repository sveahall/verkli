"use client";
import { useMemo, useState } from "react";
import type { RecoveryItem } from "@/features/book-recovery/contracts";
import RecoveryPanel from "@/features/book-recovery/RecoveryPanel";
import { createRecoveryFixture } from "./fixture";

export default function Preview() {
  const [fixture, setFixture] = useState(createRecoveryFixture);
  const [failure, setFailure] = useState(false);
  const [otherOwner, setOtherOwner] = useState(false);
  const [instance, setInstance] = useState(0);
  const fixtureAdapter = fixture.adapter;
  const adapter = useMemo(() => ({
    list: async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      if (failure) throw new Error("Synthetic read failure");
      return fixtureAdapter.list();
    },
    restore: async (expected: RecoveryItem) => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      if (failure) throw new Error("Synthetic service failure. No manuscript was changed.");
      return fixtureAdapter.restore(expected);
    },
  }), [fixtureAdapter, failure]);
  return <main className="min-h-screen space-y-6 bg-background p-4 text-foreground sm:p-8">
    <aside className="mx-auto max-w-5xl rounded-2xl border border-amber-500/40 p-4 text-sm">
      <strong>Local recovery fixture · synthetic manuscripts only</strong>
      <p className="mt-1">No database connection. Changes last only until reload. Real book and chapter deletion is currently permanent; this preview does not change that.</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button className="rounded-lg border px-3 py-2" onClick={() => { setFixture(createRecoveryFixture()); setOtherOwner(false); setFailure(false); setInstance((n) => n + 1); }}>Reset fixture</button>
        <button className="rounded-lg border px-3 py-2" onClick={() => fixture.changeRevision("book")}>Simulate concurrent edit</button>
        <button className="rounded-lg border px-3 py-2" aria-pressed={failure} onClick={() => setFailure(!failure)}>Service failure: {failure ? "on" : "off"}</button>
        <button className="rounded-lg border px-3 py-2" onClick={() => { fixture.setOwner(otherOwner ? "author" : "other"); setOtherOwner(!otherOwner); setInstance((n) => n + 1); }}>Account: {otherOwner ? "other author" : "owner"}</button>
      </div>
    </aside>
    <RecoveryPanel key={instance} adapter={adapter} />
  </main>;
}
