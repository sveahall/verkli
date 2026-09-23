"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import IllustrationPanel from "@/features/book-illustrations/IllustrationPanel";
import { loadLocalImage } from "@/features/book-illustrations/local-image";
import { createIllustrationFixture } from "./fixture";

export default function Preview() {
  const [fixture, setFixture] = useState(createIllustrationFixture);
  const [failure, setFailure] = useState(false);
  const [hold, setHold] = useState(false);
  const [instance, setInstance] = useState(0);
  const holding = useRef(false);
  const waiting = useRef<Array<() => void>>([]);
  const release = useCallback(() => { waiting.current.splice(0).forEach((resolve) => resolve()); }, []);
  useEffect(() => () => { holding.current = false; release(); }, [release]);
  const imageLoader = useCallback(async (file: File, signal?: AbortSignal) => {
    const image = await loadLocalImage(file, signal);
    if (holding.current && !signal?.aborted) await new Promise<void>((resolve) => {
      const finish = () => { signal?.removeEventListener("abort", finish); waiting.current = waiting.current.filter((entry) => entry !== finish); resolve(); };
      waiting.current.push(finish);
      signal?.addEventListener("abort", finish, { once: true });
    });
    if (signal?.aborted) { image.dispose(); throw new Error("Image reading was cancelled."); }
    return image;
  }, []);
  return <main className="min-h-screen space-y-6 bg-background px-4 py-8 text-foreground sm:px-8">
    <IllustrationPanel key={instance} adapter={fixture.adapter} imageLoader={imageLoader} />
    <details className="mx-auto max-w-6xl rounded-xl border border-border p-4 text-sm" open>
      <summary className="cursor-pointer font-medium">Demo test controls</summary>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2"><input type="checkbox" checked={failure} onChange={(event) => { fixture.setFailure(event.target.checked); setFailure(event.target.checked); }} />Simulate approval failure</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={hold} onChange={(event) => { holding.current = event.target.checked; setHold(event.target.checked); if (!event.target.checked) release(); }} />Hold image decoding</label>
        <button className="rounded-lg border px-3 py-2" onClick={release}>Release images</button>
        <button className="rounded-lg border px-3 py-2" onClick={() => { fixture.changeChapter(); setInstance((value) => value + 1); }}>Change chapter revision</button>
        <button className="rounded-lg border px-3 py-2" onClick={() => { holding.current = false; release(); setHold(false); setFailure(false); setFixture(createIllustrationFixture()); setInstance((value) => value + 1); }}>Reset demo</button>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Synthetic chapters only. Holding image decoding lets you test switching chapter or profile while an image is still being read.</p>
    </details>
  </main>;
}
