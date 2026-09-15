"use client";

import { useRef, useState } from "react";
import { BookOpen, ImagePlus, RotateCcw, Upload } from "lucide-react";
import { getCoverGeometry, type ProductionSettings } from "./model";
import styles from "./ProductionStudio.module.css";

export type ProductionArtwork = { path: string; url: string; width: number; height: number };
export type ArtworkSide = "front" | "back";
export type ArtworkMap = Partial<Record<ArtworkSide, ProductionArtwork>>;

export function ProductionCover({ settings, artwork, onChange, onUpload, onRemove, uploading }: {
  settings: ProductionSettings;
  artwork: ArtworkMap;
  onChange: (patch: Partial<ProductionSettings>) => void;
  onUpload: (side: ArtworkSide, file: File) => void;
  onRemove: (side: ArtworkSide) => void;
  uploading: ArtworkSide | null;
}) {
  const [view, setView] = useState<"spread" | ArtworkSide>("spread");
  const [guides, setGuides] = useState(true);
  const input = useRef<HTMLInputElement>(null);
  const uploadSide = useRef<ArtworkSide>("front");
  const geometry = getCoverGeometry(settings);
  const spine = settings.spineWidthMm ?? 8;
  const patchCover = (patch: Partial<ProductionSettings["cover"]>) => onChange({ cover: { ...settings.cover, ...patch } });
  const chooseFile = (side: ArtworkSide) => { uploadSide.current = side; input.current?.click(); };
  const coverStyle = { background: settings.cover.background, color: settings.cover.textColor };

  function face(side: ArtworkSide) {
    return <div className={`${styles.face} ${guides ? styles.guided : ""}`} style={{ ...coverStyle, aspectRatio: `${settings.trimWidthMm}/${settings.trimHeightMm}` }}>
      {artwork[side] && <div className={styles.coverImage} role="img" aria-label={`${side} cover artwork`} style={{ backgroundImage: `url(${JSON.stringify(artwork[side]?.url)})` }} />}
      {side === "front" ? <>
        {settings.cover.printTitle && <div className={styles.frontType}>
          <span>{settings.author || "Author name"}</span>
          <strong>{settings.title || "Your book title"}</strong>
          {settings.subtitle && <em>{settings.subtitle}</em>}
        </div>}
        {!artwork.front && <span className={styles.artworkHint}>Add your front artwork</span>}
      </> : <>
        {(settings.cover.backText || !artwork.back) && <p className={styles.backCopy}>{settings.cover.backText || "The words that make someone open your book. Add your back-cover copy below."}</p>}
        {settings.cover.reserveBarcode && <div className={styles.barcodeSpace}><span>Barcode area</span><small>{settings.isbn || "Reserved for your printer"}</small></div>}
      </>}
    </div>;
  }

  return <div className={styles.coverLayout}>
    <section className={styles.visualCard} aria-label="Cover layout preview">
      <div className={styles.visualToolbar}>
        <div className={styles.segmented} aria-label="Cover view">
          {(["spread", "front", "back"] as const).map((item) => <button key={item} type="button" aria-pressed={view === item} onClick={() => setView(item)}>{item === "spread" ? <><BookOpen size={15} aria-hidden />Full wrap</> : item === "front" ? "Front" : "Back"}</button>)}
        </div>
        <label className={styles.inlineCheck}><input type="checkbox" checked={guides} onChange={(event) => setGuides(event.target.checked)} />Guides</label>
      </div>
      <div className={styles.coverStage}>
        {view === "spread" ? <div className={styles.spread} style={{ gridTemplateColumns: `${settings.trimWidthMm}fr ${spine}fr ${settings.trimWidthMm}fr` }}>
          {face("back")}
          <div className={styles.spine} style={coverStyle}><span>{settings.cover.spineText || settings.title}</span></div>
          {face("front")}
        </div> : <div className={styles.singleFace} key={view}>{face(view)}</div>}
      </div>
      <div className={styles.dimensionStrip}>
        {view === "spread" ? <><span>Back</span><span>{settings.spineWidthMm === null ? "Spine: set with printer" : `${settings.spineWidthMm} mm spine`}</span><span>Front</span></> : <span>{settings.trimWidthMm} × {settings.trimHeightMm} mm · trimmed size</span>}
      </div>
      <p className={styles.previewNote}>{geometry.widthMm === null ? "Set the spine measurement to calculate the full wrap. Its width here is illustrative." : `Full wrap with bleed: ${geometry.widthMm.toFixed(2)} × ${geometry.heightMm.toFixed(2)} mm.`} Preview guides are excluded from export.</p>
    </section>

    <section className={styles.coverDetails} aria-label="Cover artwork and text">
      <div><h3 className={styles.sectionTitle}>Every side tells the story.</h3><p className={styles.help}>Keep your print originals at full resolution. These are separate from your digital cover.</p></div>
      <input ref={input} type="file" accept="image/jpeg,image/png" className="sr-only" tabIndex={-1} aria-label="Choose print artwork" onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload(uploadSide.current, file); event.target.value = ""; }} />
      <div className={styles.uploadPair}>
        {(["front", "back"] as const).map((side) => <div key={side}><button className={styles.uploadCard} type="button" disabled={uploading !== null} onClick={() => chooseFile(side)}>
          {artwork[side] ? <RotateCcw size={18} aria-hidden /> : <ImagePlus size={20} aria-hidden />}
          <strong>{uploading === side ? "Uploading…" : `${side === "front" ? "Front" : "Back"} artwork`}</strong>
          <span>{artwork[side] ? `${artwork[side]?.width} × ${artwork[side]?.height} px · replace` : "Upload JPG or PNG"}</span>
        </button>{artwork[side] && <button type="button" className={styles.removeButton} disabled={uploading !== null} onClick={() => onRemove(side)}>Remove {side} artwork</button>}</div>)}
      </div>
      <p className={styles.help}><Upload size={13} aria-hidden /> Use artwork with room for bleed. The preview fills the cover; keep important details away from its edges.</p>
      <label className={styles.field}>Back-cover copy<textarea rows={6} maxLength={4000} value={settings.cover.backText} onChange={(event) => patchCover({ backText: event.target.value })} placeholder="A compelling introduction to the story inside…" /></label>
      <label className={styles.field}>Spine text<input value={settings.cover.spineText} maxLength={180} onChange={(event) => patchCover({ spineText: event.target.value })} placeholder={settings.title || "Title and author"} /></label>
      <div className={styles.colorRow}>
        <label><input type="color" value={settings.cover.background} onChange={(event) => patchCover({ background: event.target.value })} />Cover colour</label>
        <label><input type="color" value={settings.cover.textColor} onChange={(event) => patchCover({ textColor: event.target.value })} />Type colour</label>
      </div>
      <label className={styles.inlineCheck}><input type="checkbox" checked={settings.cover.printTitle} onChange={(event) => patchCover({ printTitle: event.target.checked })} />Add title and author to the front</label>
      <label className={styles.inlineCheck}><input type="checkbox" checked={settings.cover.reserveBarcode} onChange={(event) => patchCover({ reserveBarcode: event.target.checked })} />Reserve a barcode area on the back</label>
    </section>
  </div>;
}
