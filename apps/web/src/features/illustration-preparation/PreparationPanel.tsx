"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { calculateCrop, type CropSettings } from "./geometry";
import { exportCrop, loadSource, renderCrop, type PreparedSource } from "./image";

const initial: CropSettings = { aspect: "original", zoom: 1, x: 50, y: 50 };
const field = "mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 py-2 text-base";
function message(error: unknown) { return error instanceof Error ? error.message : "The image could not be prepared. Please try again."; }
function Preview({ source, settings, format, onError }: { source: PreparedSource; settings: CropSettings; format: "png" | "jpeg"; onError: (error: unknown) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const target = canvas.current; if (!target) return;
    try { renderCrop(target, source, settings, format); } catch (error) { onError(error); }
    return () => { target.width = 1; target.height = 1; };
  }, [source, settings, format, onError]);
  return <canvas ref={canvas} aria-label="Cropped image preview" className="mx-auto max-h-[60vh] max-w-full object-contain" />;
}
export default function PreparationPanel() {
  const [source, setSource] = useState<PreparedSource | null>(null);
  const [settings, setSettings] = useState<CropSettings>(initial);
  const [format, setFormat] = useState<"png" | "jpeg">("png");
  const [loading, setLoading] = useState(false); const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const current = useRef<PreparedSource | null>(null); const sequence = useRef({ id: 0 }); const controller = useRef<AbortController | null>(null);
  const downloads = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const links = downloads.current; const requests = sequence.current;
    return () => { requests.id++; controller.current?.abort(); current.current?.dispose(); current.current = null; for (const [url, timer] of links) { clearTimeout(timer); URL.revokeObjectURL(url); } links.clear(); };
  }, []);
  const previewError = useCallback((failure: unknown) => setError(message(failure)), []);
  async function choose(file: File) {
    const request = ++sequence.current.id; controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    setLoading(true); setError(""); setNotice("");
    try {
      const next = await loadSource(file, abort.signal);
      if (request !== sequence.current.id) { next.dispose(); return; }
      const previous = current.current; current.current = next; setSource(next); setSettings(initial); previous?.dispose();
    } catch (failure) { if (request === sequence.current.id) setError(message(failure)); }
    finally { if (request === sequence.current.id) setLoading(false); }
  }
  let crop: ReturnType<typeof calculateCrop> | null = null; let cropError = "";
  if (source) { try { crop = calculateCrop(source.width, source.height, settings); } catch (failure) { cropError = message(failure); } }
  async function download() {
    if (!source || !crop || loading || exporting) return;
    const output = crop; const request = sequence.current.id; setExporting(true); setError(""); setNotice("");
    try {
      const blob = await exportCrop(source, settings, format);
      if (request !== sequence.current.id) return;
      const url = URL.createObjectURL(blob); const link = document.createElement("a");
      const timer = setTimeout(() => { URL.revokeObjectURL(url); downloads.current.delete(url); }, 60_000); downloads.current.set(url, timer);
      link.href = url; link.download = `illustration-${settings.aspect}-${output.width}x${output.height}.${format === "jpeg" ? "jpg" : "png"}`;
      document.body.appendChild(link); try { link.click(); } finally { link.remove(); }
      setNotice("Download started. This file has not been saved as an illustration in your book.");
    } catch (failure) { if (request === sequence.current.id) setError(message(failure)); }
    finally { if (request === sequence.current.id) setExporting(false); }
  }
  function change(next: Partial<CropSettings>) { setSettings((previous) => ({ ...previous, ...next })); setError(""); setNotice(""); }
  return <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-8">
    <header className="max-w-3xl space-y-3"><h1 className="text-page-title">Prepare an illustration</h1><p className="text-muted-foreground">Frame a chapter icon or page illustration, then download a PNG or JPEG. Your image stays in this browser; nothing is uploaded or saved in your book.</p></header>
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section className="min-w-0 space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-6" aria-label="Image preview">
        <label className="block text-sm font-medium">Source image<input className={`${field} file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:px-3 file:py-2 file:text-accent-foreground`} type="file" accept="image/png,image/jpeg" disabled={exporting} onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void choose(file); }} /></label>
        <p className="text-sm text-muted-foreground">PNG or JPEG, up to 10 MB and 40 megapixels. A rejected replacement keeps your current image and crop.</p>
        {loading && <p role="status">Reading image…</p>}
        {source && <p className="break-words text-sm text-muted-foreground">{source.name} · source {source.width} × {source.height} px</p>}
        <div className="flex min-h-64 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/30 p-3">
          {source && crop ? <Preview source={source} settings={settings} format={format} onError={previewError} /> : <p className="max-w-xs p-6 text-center text-muted-foreground">{source ? "Reset the crop or reduce zoom to fit this image." : "Choose an image to see your composition here."}</p>}
        </div>
        <p className="text-sm text-muted-foreground">Leaving this page clears local work. Your original file is never changed.</p>
      </section>
      <section className="min-w-0 space-y-5 rounded-2xl border border-border bg-card p-5" aria-label="Composition controls">
        <h2 className="text-section-title">Composition</h2>
        <fieldset disabled={!source || loading || exporting} className="space-y-5 disabled:opacity-60">
          <label className="block text-sm font-medium">Crop shape<select className={field} value={settings.aspect} onChange={(event) => change({ aspect: event.target.value as CropSettings["aspect"] })}><option value="original">Original proportions</option><option value="square">Chapter icon · 1:1</option><option value="landscape">Landscape · 3:2</option><option value="portrait">Portrait · 2:3</option></select></label>
          <label className="block text-sm font-medium">Zoom<input aria-label="Zoom" className="mt-2 block min-h-11 w-full accent-primary" type="range" min="1" max="3" step="0.05" value={settings.zoom} onChange={(event) => change({ zoom: Number(event.target.value) })} /><span className="text-muted-foreground">{settings.zoom.toFixed(2)}×</span></label>
          <label className="block text-sm font-medium">Horizontal position<input aria-label="Horizontal position" className="mt-2 block min-h-11 w-full accent-primary" type="range" min="0" max="100" value={settings.x} onChange={(event) => change({ x: Number(event.target.value) })} /></label>
          <label className="block text-sm font-medium">Vertical position<input aria-label="Vertical position" className="mt-2 block min-h-11 w-full accent-primary" type="range" min="0" max="100" value={settings.y} onChange={(event) => change({ y: Number(event.target.value) })} /></label>
          <Button variant="secondary" fullWidth onClick={() => change(initial)}>Reset crop</Button>
          <label className="block text-sm font-medium">Download format<select className={field} value={format} onChange={(event) => { setFormat(event.target.value as "png" | "jpeg"); setError(""); setNotice(""); }}><option value="png">PNG · keep transparency</option><option value="jpeg">JPEG · white background</option></select></label>
        </fieldset>
        <div className="space-y-2 border-t border-border pt-4"><h3 className="text-sm font-medium">Download size</h3><p className="font-medium tabular-nums">{crop ? `${crop.width} × ${crop.height} px` : "Choose an image first"}</p><p className="text-sm text-muted-foreground">Up to 1600 px per side, without enlarging the crop. Check your publisher’s size requirements before printing.</p></div>
        <Button fullWidth disabled={!source || !crop || loading || exporting} isLoading={exporting} loadingText="Preparing download…" onClick={() => void download()}>Download image</Button>
      </section>
    </div>
    {(error || cropError) && <p role="alert" className="rounded-xl border border-red-500/40 bg-red-500/5 p-4 text-sm">{error || cropError}</p>}
    {notice && <p role="status" className="rounded-xl border border-border bg-card p-4 text-sm">{notice}</p>}
  </main>;
}
