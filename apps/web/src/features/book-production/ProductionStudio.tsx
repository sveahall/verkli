"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, BookOpen, ImageIcon, Info, Loader2, Save, SlidersHorizontal } from "lucide-react";
import { productionSettingsSchema, type ProductionSettings } from "./model";
import { ProductionCover, type ArtworkMap, type ArtworkSide, type ProductionArtwork } from "./ProductionCover";
import { ProductionStructure, type ProductionChapter } from "./ProductionStructure";
import { ProductionFormat, type ProductionProof } from "./ProductionFormat";
import styles from "./ProductionStudio.module.css";

export interface ProductionStudioProps {
  initialSettings: ProductionSettings;
  initialArtwork?: ArtworkMap;
  chapters: ProductionChapter[];
  localPreview?: boolean;
  onSave?: (settings: ProductionSettings, artwork: ArtworkMap) => Promise<void>;
  onUpload?: (side: ArtworkSide, file: File) => Promise<ProductionArtwork>;
  onBuild?: (settings: ProductionSettings, artwork: ArtworkMap) => Promise<ProductionProof>;
  onOpenWriting?: () => void;
}

export default function ProductionStudio({ initialSettings, initialArtwork = {}, chapters, localPreview = false, onSave, onUpload, onBuild, onOpenWriting }: ProductionStudioProps) {
  const [settings, setSettings] = useState(initialSettings);
  const [artwork, setArtwork] = useState(initialArtwork);
  const [savedSnapshot, setSavedSnapshot] = useState(JSON.stringify(initialSettings));
  const [tab, setTab] = useState<"cover" | "structure" | "format">("cover");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<ArtworkSide | null>(null);
  const [building, setBuilding] = useState(false);
  const [proof, setProof] = useState<ProductionProof | null>(null);
  const [error, setError] = useState<string | null>(null);
  const uploadLock = useRef(false);
  const saveLock = useRef(false);
  const buildLock = useRef(false);
  const currentSnapshot = useRef(JSON.stringify(settings));
  const snapshot = JSON.stringify(settings);
  const dirty = snapshot !== savedSnapshot;
  currentSnapshot.current = snapshot;
  const validation = productionSettingsSchema.safeParse(settings);
  const validationError = validation.success ? null : `${validation.error.issues[0].path.join(" · ")}: ${validation.error.issues[0].message}`;

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  function change(patch: Partial<ProductionSettings>) { setSettings((previous) => ({ ...previous, ...patch })); setProof(null); setError(null); }
  async function save() {
    if (!onSave || saveLock.current || !validation.success) return;
    saveLock.current = true; setSaving(true); setError(null);
    try { await onSave(validation.data, artwork); setSavedSnapshot(snapshot); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save this edition. Your changes are still here; try again."); }
    finally { saveLock.current = false; setSaving(false); }
  }
  async function upload(side: ArtworkSide, file: File) {
    if (!onUpload || uploadLock.current) return;
    if (!["image/jpeg", "image/png"].includes(file.type) || file.size > 20 * 1024 * 1024) { setError("Choose a JPG or PNG image smaller than 20 MB."); return; }
    uploadLock.current = true; setUploading(side); setError(null);
    try {
      const asset = await onUpload(side, file);
      setArtwork((previous) => ({ ...previous, [side]: asset }));
      setSettings((previous) => ({ ...previous, cover: { ...previous.cover, [side === "front" ? "frontPath" : "backPath"]: asset.path } }));
      setProof(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Artwork upload failed. Your previous artwork has been kept."); }
    finally { uploadLock.current = false; setUploading(null); }
  }
  async function build() {
    if (!onBuild || buildLock.current || !validation.success) return;
    const requestedSnapshot = snapshot;
    buildLock.current = true; setBuilding(true); setError(null);
    try {
      const result = await onBuild(validation.data, artwork);
      if (currentSnapshot.current === requestedSnapshot) setProof(result);
      else setError("Your layout changed while the proof was being made. Generate it again to include the latest changes.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not generate the print proof. Your book has not been changed."); }
    finally { buildLock.current = false; setBuilding(false); }
  }
  const tabs = [{ id: "cover", label: "Cover wrap", icon: ImageIcon }, { id: "structure", label: "Book structure", icon: BookOpen }, { id: "format", label: "Format & export", icon: SlidersHorizontal }] as const;
  return <section className={styles.studio} aria-label="Book production studio">
    <header className={styles.header}><div><h2>A book. From cover to cover.</h2><p>Shape the outside. Put every page in its place. Prepare the edition you want to hold in your hands.</p></div><div className={styles.headerActions}><span className={styles.saveStatus} role="status">{saving ? "Saving…" : dirty ? "Unsaved changes" : localPreview ? "Local draft" : "Saved"}</span>{onSave && <button className={styles.primaryButton} type="button" disabled={saving || !dirty || !validation.success || uploading !== null} onClick={save}>{saving ? <Loader2 className={styles.spinner} size={16} aria-hidden /> : <Save size={16} aria-hidden />}{localPreview ? "Save local draft" : "Save edition"}</button>}</div></header>
    {localPreview && <p className={styles.notice}><Info size={16} aria-hidden />Local layout preview. Drafts stay in this browser. Nothing here publishes your book or sends an order to a printer.</p>}
    {error && <p className={`${styles.notice} ${styles.error}`} role="alert"><AlertCircle size={17} aria-hidden />{error}</p>}
    {validationError && <p className={`${styles.notice} ${styles.error}`} role="alert"><AlertCircle size={17} aria-hidden />{validationError}</p>}
    <div className={styles.tabs} role="tablist" aria-label="Production tools">{tabs.map(({ id, label, icon: Icon }, index) => <button type="button" key={id} role="tab" id={`production-tab-${id}`} aria-selected={tab === id} aria-controls={`production-panel-${id}`} tabIndex={tab === id ? 0 : -1} onClick={() => setTab(id)} onKeyDown={(event) => { const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1; if (next >= 0) { event.preventDefault(); setTab(tabs[next].id); document.getElementById(`production-tab-${tabs[next].id}`)?.focus(); } }}><Icon size={17} aria-hidden />{label}</button>)}</div>
    <div role="tabpanel" id={`production-panel-${tab}`} aria-labelledby={`production-tab-${tab}`}>
      {tab === "cover" && <ProductionCover settings={settings} artwork={artwork} onChange={change} onUpload={upload} onRemove={(side) => { setArtwork((previous) => { const next = { ...previous }; delete next[side]; return next; }); change({ cover: { ...settings.cover, [side === "front" ? "frontPath" : "backPath"]: null } }); }} uploading={uploading} />}
      {tab === "structure" && <ProductionStructure settings={settings} chapters={chapters} onChange={change} onOpenWriting={onOpenWriting} />}
      {tab === "format" && <ProductionFormat settings={settings} onChange={change} proof={proof} building={building} onBuild={build} exportAvailable={Boolean(onBuild) && validation.success && uploading === null} />}
    </div>
  </section>;
}
