"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, BookOpen, ImageIcon, Info, Loader2, Save, SlidersHorizontal } from "lucide-react";
import { productionSettingsSchema, type ProductionSettings } from "./model";
import { ProductionCover, type ArtworkMap, type ArtworkSide, type ProductionArtwork } from "./ProductionCover";
import { ProductionStructure, type ProductionChapter } from "./ProductionStructure";
import { ProductionFormat, type ProductionProof } from "./ProductionFormat";
import type { BrowserProductionDraft } from "./browser-draft";
import type { ProductionExportKind } from "./remote-draft";
import styles from "./ProductionStudio.module.css";

export interface ProductionStudioProps {
  initialSettings: ProductionSettings;
  initialArtwork?: ArtworkMap;
  initialSavedSettings?: ProductionSettings;
  recoveryNotice?: string;
  onDraftChange?: (draft: BrowserProductionDraft) => void;
  chapters: ProductionChapter[];
  localPreview?: boolean;
  localNotice?: string;
  notice?: string;
  requireSave?: boolean;
  saveBlockedReason?: string;
  onSave?: (settings: ProductionSettings, artwork: ArtworkMap) => Promise<void | { settings: ProductionSettings; artwork: ArtworkMap }>;
  onUpload?: (side: ArtworkSide, file: File) => Promise<ProductionArtwork>;
  onBuild?: (kind: ProductionExportKind, settings: ProductionSettings, artwork: ArtworkMap) => Promise<ProductionProof>;
  onOpenWriting?: () => void;
}

export default function ProductionStudio({ initialSettings, initialArtwork = {}, initialSavedSettings = initialSettings, recoveryNotice, onDraftChange, chapters, localPreview = false, localNotice, notice, requireSave = false, saveBlockedReason, onSave, onUpload, onBuild, onOpenWriting }: ProductionStudioProps) {
  const [settings, setSettings] = useState(initialSettings);
  const [artwork, setArtwork] = useState(initialArtwork);
  const [savedSnapshot, setSavedSnapshot] = useState(JSON.stringify(initialSavedSettings));
  const [tab, setTab] = useState<"cover" | "structure" | "format">("cover");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<ArtworkSide | null>(null);
  const [building, setBuilding] = useState<ProductionExportKind | null>(null);
  const [proof, setProof] = useState<ProductionProof | null>(null);
  const proofRef = useRef<ProductionProof | null>(null);
  const chapterSnapshot = useMemo(() => JSON.stringify(chapters.map(({ id, order, title, content }) => ({ id, order, title, content }))), [chapters]);
  const latestChapterSnapshot = useRef(chapterSnapshot);
  const [proofChapterSnapshot, setProofChapterSnapshot] = useState(chapterSnapshot);
  if (proofChapterSnapshot !== chapterSnapshot) {
    setProofChapterSnapshot(chapterSnapshot);
    setProof(null);
  }
  useLayoutEffect(() => {
    if (latestChapterSnapshot.current === chapterSnapshot) return;
    latestChapterSnapshot.current = chapterSnapshot;
    revokeProof(proofRef.current); proofRef.current = null;
  }, [chapterSnapshot]);
  const [error, setError] = useState<string | null>(recoveryNotice ?? null);
  const draftRef = useRef<BrowserProductionDraft>({ settings: initialSettings, artwork: initialArtwork, savedSettings: initialSavedSettings, recoveryNotice });
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; revokeProof(proofRef.current); }; }, []);
  const uploadLock = useRef(false);
  const saveLock = useRef(false);
  const buildLock = useRef(false);
  const snapshot = JSON.stringify(settings);
  const dirty = snapshot !== savedSnapshot || requireSave;
  const validation = productionSettingsSchema.safeParse(settings);
  const validationError = validation.success ? null : `${validation.error.issues[0].path.join(" · ")}: ${validation.error.issues[0].message}`;

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  function updateDraft(nextSettings: ProductionSettings, nextArtwork = draftRef.current.artwork) {
    draftRef.current = { ...draftRef.current, settings: nextSettings, artwork: nextArtwork };
    onDraftChange?.(draftRef.current);
    setSettings(nextSettings); setArtwork(nextArtwork);
  }
  function clearProof() { revokeProof(proofRef.current); proofRef.current = null; setProof(null); }
  function change(patch: Partial<ProductionSettings>) { updateDraft({ ...draftRef.current.settings, ...patch }); clearProof(); setError(null); }
  async function save() {
    if (!onSave || saveLock.current || uploadLock.current || saveBlockedReason || !validation.success) return;
    saveLock.current = true; setSaving(true); setError(null);
    try {
      const result = await onSave(validation.data, artwork);
      if (!mounted.current) return;
      const savedSettings = result?.settings ?? validation.data;
      const savedArtwork = result?.artwork ?? artwork;
      draftRef.current = { settings: savedSettings, artwork: savedArtwork, savedSettings, recoveryNotice: undefined };
      onDraftChange?.(draftRef.current);
      setSettings(savedSettings); setArtwork(savedArtwork); setSavedSnapshot(JSON.stringify(savedSettings));
      clearProof();
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save this edition. Your changes are still here; try again."); }
    finally { saveLock.current = false; setSaving(false); }
  }
  async function upload(side: ArtworkSide, file: File) {
    if (!onUpload || uploadLock.current || saveLock.current) return;
    if (!["image/jpeg", "image/png"].includes(file.type) || file.size > 20 * 1024 * 1024) { setError("Choose a JPG or PNG image smaller than 20 MB."); return; }
    uploadLock.current = true; setUploading(side); setError(null);
    draftRef.current = { ...draftRef.current, recoveryNotice: "An image import was interrupted when you left this layout. Your previous artwork was kept. Please choose the image again." };
    onDraftChange?.(draftRef.current);
    try {
      const asset = await onUpload(side, file);
      if (!mounted.current) return;
      draftRef.current = { ...draftRef.current, recoveryNotice: undefined };
      const latest = draftRef.current;
      updateDraft({ ...latest.settings, cover: { ...latest.settings.cover, [side === "front" ? "frontPath" : "backPath"]: asset.path } }, { ...latest.artwork, [side]: asset });
      clearProof();
    } catch (cause) { if (!mounted.current) return; draftRef.current = { ...draftRef.current, recoveryNotice: undefined }; onDraftChange?.(draftRef.current); setError(cause instanceof Error ? cause.message : "Artwork upload failed. Your previous artwork has been kept."); }
    finally { uploadLock.current = false; setUploading(null); }
  }
  async function build(kind: ProductionExportKind) {
    if (!onBuild || buildLock.current || saveLock.current || uploadLock.current || dirty || saveBlockedReason || !validation.success) return;
    const requestedSnapshot = snapshot;
    const requestedChapterSnapshot = chapterSnapshot;
    buildLock.current = true; setBuilding(kind); setError(null);
    try {
      const result = await onBuild(kind, validation.data, artwork);
      if (!mounted.current) { revokeProof(result); return; }
      if (JSON.stringify(draftRef.current.settings) === requestedSnapshot && latestChapterSnapshot.current === requestedChapterSnapshot) {
        const previous = proofRef.current;
        const oldUrl = kind === "interior" ? previous?.interiorUrl : previous?.coverUrl;
        if (oldUrl?.startsWith("blob:")) URL.revokeObjectURL(oldUrl);
        const next = { pageCount: result.pageCount ?? previous?.pageCount ?? null, interiorUrl: result.interiorUrl ?? previous?.interiorUrl ?? null, coverUrl: result.coverUrl ?? previous?.coverUrl ?? null, notes: [...new Set([...(previous?.notes ?? []), ...result.notes])] };
        proofRef.current = next; setProofChapterSnapshot(requestedChapterSnapshot); setProof(next);
      } else { revokeProof(result); setError("Your layout or manuscript changed while the proof was being made. Save the latest chapter changes in Write and generate the PDF again."); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not generate the print proof. Your book has not been changed."); }
    finally { buildLock.current = false; setBuilding(null); }
  }
  const tabs = [{ id: "cover", label: "Cover wrap", icon: ImageIcon }, { id: "structure", label: "Book structure", icon: BookOpen }, { id: "format", label: "Format & export", icon: SlidersHorizontal }] as const;
  return <section className={styles.studio} aria-label="Book production studio">
    <header className={styles.header}><div><h2>A book. From cover to cover.</h2><p>Shape the outside. Put every page in its place. Prepare the edition you want to hold in your hands.</p></div><div className={styles.headerActions}><span className={styles.saveStatus} role="status">{saving ? "Saving…" : dirty ? "Unsaved changes" : localPreview ? "Local draft" : "Saved to your account"}</span>{onSave && <button className={styles.primaryButton} type="button" disabled={saving || !dirty || !validation.success || uploading !== null || Boolean(saveBlockedReason)} onClick={save}>{saving ? <Loader2 className={styles.spinner} size={16} aria-hidden /> : <Save size={16} aria-hidden />}{localPreview ? "Save local draft" : "Save edition"}</button>}</div></header>
    {localPreview && <p className={styles.notice}><Info size={16} aria-hidden />{localNotice ?? "Local layout preview. Drafts stay in this browser. Nothing here publishes your book or sends an order to a printer."}</p>}
    {notice && <p className={styles.notice}><Info size={16} aria-hidden />{notice}</p>}
    {error && <p className={`${styles.notice} ${styles.error}`} role="alert"><AlertCircle size={17} aria-hidden />{error}{draftRef.current.recoveryNotice && <button type="button" className={styles.secondaryButton} onClick={() => { draftRef.current = { ...draftRef.current, recoveryNotice: undefined }; onDraftChange?.(draftRef.current); setError(null); }}>Keep previous artwork</button>}</p>}
    {validationError && <p className={`${styles.notice} ${styles.error}`} role="alert"><AlertCircle size={17} aria-hidden />{validationError}</p>}
    <fieldset disabled={saving} className={styles.editorFields} aria-busy={saving}>
    <div className={styles.tabs} role="tablist" aria-label="Production tools">{tabs.map(({ id, label, icon: Icon }, index) => <button type="button" key={id} role="tab" id={`production-tab-${id}`} aria-selected={tab === id} aria-controls={`production-panel-${id}`} tabIndex={tab === id ? 0 : -1} onClick={() => setTab(id)} onKeyDown={(event) => { const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1; if (next >= 0) { event.preventDefault(); setTab(tabs[next].id); document.getElementById(`production-tab-${tabs[next].id}`)?.focus(); } }}><Icon size={17} aria-hidden />{label}</button>)}</div>
    <div role="tabpanel" id={`production-panel-${tab}`} aria-labelledby={`production-tab-${tab}`}>
      {tab === "cover" && <ProductionCover settings={settings} artwork={artwork} onChange={change} onUpload={upload} onRemove={(side) => { const next = { ...draftRef.current.artwork }; delete next[side]; updateDraft({ ...settings, cover: { ...settings.cover, [side === "front" ? "frontPath" : "backPath"]: null } }, next); clearProof(); setError(null); }} uploading={uploading} />}
      {tab === "structure" && <ProductionStructure settings={settings} chapters={chapters} onChange={change} onOpenWriting={onOpenWriting ? () => { if (dirty || uploading) { setError("Save your layout before opening the manuscript so your changes are kept."); return; } onOpenWriting(); } : undefined} />}
      {tab === "format" && <>
        {onBuild && <p className={styles.notice}><Info size={16} aria-hidden />PDFs use a saved manuscript snapshot. Save your chapter changes in Write before generating, and generate again after further edits.</p>}
        <ProductionFormat settings={settings} onChange={change} proof={proofChapterSnapshot === chapterSnapshot ? proof : null} building={building} onBuild={build} exportAvailable={Boolean(onBuild) && validation.success && uploading === null && !dirty && !saveBlockedReason} exportBlockedReason={!onBuild ? "PDF export is not connected in this local preview." : saveBlockedReason ?? (dirty ? "Save your edition before generating PDFs." : !validation.success ? "Resolve the highlighted settings before exporting." : uploading ? "Wait for the artwork import, then save your edition." : undefined)} />
      </>}
    </div>
    </fieldset>
  </section>;
}

function revokeProof(proof: ProductionProof | null) {
  for (const url of [proof?.interiorUrl, proof?.coverUrl]) if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
}
