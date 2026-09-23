"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Moon, RotateCcw } from "lucide-react";
import ProductionStudio from "@/features/book-production/ProductionStudio";
import { createProductionSettings, type ProductionSettings } from "@/features/book-production/model";
import type { ArtworkMap, ArtworkSide, ProductionArtwork } from "@/features/book-production/ProductionCover";

import { localDraftSchema, readPrintArtwork } from "@/features/book-production/browser-draft";

const STORAGE_KEY = "verkli-book-production-local-preview-v1";
const chapters = [
  { id: "chapter-1", title: "The last ferry", order: 1, content: "The harbour was quiet that morning. Mira stood at the water’s edge, a letter folded into her coat pocket.\n\nAcross the bay, the windows of the last ferry caught the first light." },
  { id: "chapter-2", title: "A letter from the sea", order: 2, content: "By noon, the tide had changed. The letter was still unopened.\n\nShe recognised the handwriting, though she had not seen it in twenty years." },
  { id: "chapter-3", title: "The crossing", order: 3, content: "There was no turning back now. She stepped aboard, and the harbour began to disappear behind her." },
];

function sampleSettings() {
  const settings = createProductionSettings({ title: "The Last Ferry", author: "Alex Morgan" });
  settings.subtitle = "Some journeys bring you home.";
  settings.cover.backText = "One letter. One crossing. A lifetime of things left unsaid.\n\nWhen Mira returns to the island she left twenty years ago, the last ferry carries more than a passenger. It carries the beginning of a story she thought had ended.\n\nA novel about the places we leave, the people we remember, and the courage it takes to come back.";
  settings.cover.spineText = "The Last Ferry · Alex Morgan";
  settings.cover.background = "#302238";
  settings.cover.textColor = "#FBFAF9";
  settings.publisher = "Verkli sample edition";
  return settings;
}

export default function ProductionPreview() {
  const [initial, setInitial] = useState<ProductionSettings | null>(null);
  const [assets, setAssets] = useState<ArtworkMap>({});
  const [instance, setInstance] = useState(0);
  const [failure, setFailure] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
    let settings = sampleSettings();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = localDraftSchema.safeParse(JSON.parse(raw));
        if (parsed.success) {
          settings = parsed.data.settings;
          setAssets(parsed.data.artwork);
        } else setRestoreError("The saved local draft could not be read. A fresh sample is open; your stored draft has not been overwritten.");
      }
    } catch { setRestoreError("The saved local draft could not be read. A fresh sample is open."); }
    setInitial(settings);
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  async function upload(side: ArtworkSide, file: File): Promise<ProductionArtwork> {
    if (failure) throw new Error("Simulated upload failure. The previous artwork is still in place.");
    return readPrintArtwork(side, file);
  }
  function reset() { localStorage.removeItem(STORAGE_KEY); setRestoreError(null); const settings = sampleSettings(); setAssets({}); setInitial(settings); setInstance((value) => value + 1); }
  return <main className="min-h-screen bg-background text-foreground">
    <header className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-5 sm:px-10"><Image src="/logo-verkli.png?v=20260916" width={2143} height={397} unoptimized alt="Verkli" className="h-auto w-[130px] dark:hidden" /><Image src="/logo-verkli-light.png?v=20260916" width={2143} height={397} unoptimized alt="Verkli" className="hidden h-auto w-[130px] dark:block" /><div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground"><span>Book production · local preview</span><label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={failure} onChange={(event) => setFailure(event.target.checked)} />Simulate save error</label><button type="button" className="flex min-h-11 items-center gap-2" onClick={reset}><RotateCcw size={15} />Reset sample</button><button type="button" aria-label="Toggle theme" className="flex h-11 w-11 items-center justify-center rounded-full border border-border" onClick={() => document.documentElement.classList.toggle("dark")}><Moon size={17} /></button></div></header>
    <div className="@container/book-panel mx-auto max-w-[1440px] px-5 py-10 sm:px-10 sm:py-14">{restoreError && <p role="alert" className="mb-6 rounded-xl border border-border p-4 text-sm">{restoreError}</p>}{initial ? <ProductionStudio key={instance} initialSettings={initial} initialArtwork={assets} chapters={chapters} localPreview onUpload={upload} onSave={async (settings, artwork) => { if (failure) throw new Error("Simulated save failure. Your changes are still here. Turn off the error simulation and save again."); try { const draft = localDraftSchema.parse({ settings, artwork }); localStorage.setItem(STORAGE_KEY, JSON.stringify(draft)); } catch { throw new Error("Browser storage is full or unavailable. Your draft is still open; try smaller artwork."); } }} /> : <p role="status">Opening your production desk…</p>}</div>
  </main>;
}
