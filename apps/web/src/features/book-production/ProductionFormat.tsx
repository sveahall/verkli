"use client";

import { useState } from "react";
import { AlertCircle, Download, FileCheck2, Loader2 } from "lucide-react";
import { getCoverGeometry, isValidIsbn13, type ProductionSettings } from "./model";
import styles from "./ProductionStudio.module.css";

export type ProductionProof = { pageCount: number; interiorUrl: string; coverUrl: string | null; notes: string[] };

function NumberField({ label, value, onChange, min, max, step = 1, optional = false }: { label: string; value: number | null; onChange: (value: number | null) => void; min: number; max: number; step?: number; optional?: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  return <label className={styles.field}>{label}<input type="number" inputMode="decimal" min={min} max={max} step={step} value={draft ?? (value === null ? "" : String(value))} placeholder={optional ? "From your printer" : undefined} onFocus={() => setDraft(value === null ? "" : String(value))} onChange={(event) => { setDraft(event.target.value); if (event.target.value !== "" && Number.isFinite(event.target.valueAsNumber)) onChange(event.target.valueAsNumber); else if (optional) onChange(null); }} onBlur={() => setDraft(null)} /></label>;
}

export function ProductionFormat({ settings, onChange, proof, building, onBuild, exportAvailable }: {
  settings: ProductionSettings;
  onChange: (patch: Partial<ProductionSettings>) => void;
  proof: ProductionProof | null;
  building: boolean;
  onBuild: () => void;
  exportAvailable: boolean;
}) {
  const geometry = getCoverGeometry(settings);
  const [customTrim, setCustomTrim] = useState(false);
  const numberField = (key: "trimWidthMm" | "trimHeightMm" | "bleedMm" | "spineWidthMm" | "gutterMm" | "outerMarginMm" | "topMarginMm" | "bottomMarginMm" | "fontSizePt" | "leading", label: string, min: number, max: number, step = 1) => <NumberField label={label} value={settings[key]} onChange={(value) => onChange({ [key]: value })} min={min} max={max} step={step} optional={key === "spineWidthMm"} />;
  const textField = (key: "title" | "subtitle" | "author" | "publisher" | "edition" | "publicationYear" | "isbn", label: string, placeholder?: string) => <label className={styles.field}>{label}<input maxLength={key === "publicationYear" ? 4 : 180} value={settings[key]} onChange={(event) => onChange({ [key]: event.target.value })} placeholder={placeholder} /></label>;
  return <div className={styles.formatLayout}>
    <div className={styles.formatFields}>
      <section className={styles.settingsSection}>
        <h3 className={styles.sectionTitle}>Made to hold.</h3><p className={styles.help}>Paperback / perfect binding. Match these measurements to your printer’s template.</p>
        <label className={styles.field}>Trim size<select value={customTrim ? "custom" : settings.trimWidthMm === 148 && settings.trimHeightMm === 210 ? "a5" : settings.trimWidthMm === 152.4 && settings.trimHeightMm === 228.6 ? "six-nine" : settings.trimWidthMm === 127 && settings.trimHeightMm === 203.2 ? "five-eight" : "custom"} onChange={(event) => { setCustomTrim(event.target.value === "custom"); if (event.target.value === "a5") onChange({ trimWidthMm: 148, trimHeightMm: 210 }); if (event.target.value === "six-nine") onChange({ trimWidthMm: 152.4, trimHeightMm: 228.6 }); if (event.target.value === "five-eight") onChange({ trimWidthMm: 127, trimHeightMm: 203.2 }); }}><option value="a5">A5 · 148 × 210 mm</option><option value="six-nine">6 × 9 in · 152.4 × 228.6 mm</option><option value="five-eight">5 × 8 in · 127 × 203.2 mm</option><option value="custom">Custom — edit measurements below</option></select></label>
        <div className={styles.fieldGrid}>{numberField("trimWidthMm", "Width · mm", 90, 320, 0.1)}{numberField("trimHeightMm", "Height · mm", 140, 400, 0.1)}{numberField("bleedMm", "Cover bleed · mm", 0, 10, 0.001)}{numberField("spineWidthMm", "Spine · mm", 0.5, 100, 0.01)}</div>
        <label className={styles.field}>Paper / printer notes<input value={settings.paperNote} maxLength={500} onChange={(event) => onChange({ paperNote: event.target.value })} placeholder="Paper stock and printer’s reference" /></label>
        <p className={styles.help}>Generate the interior first, then ask your printer for the spine width at that page count. Hardbacks and dust jackets need different templates.</p>
      </section>
      <section className={styles.settingsSection}>
        <h3 className={styles.sectionTitle}>A comfortable read.</h3>
        <div className={styles.fieldGrid}>
          <label className={styles.field}>Book typeface<select value={settings.font} onChange={(event) => onChange({ font: event.target.value as "serif" | "sans" })}><option value="serif">Literary serif</option><option value="sans">Clean sans serif</option></select></label>
          {numberField("fontSizePt", "Type size · pt", 9, 16, 0.5)}{numberField("leading", "Line spacing", 1.1, 1.9, 0.05)}{numberField("gutterMm", "Inside margin · mm", 8, 50)}{numberField("outerMarginMm", "Outside margin · mm", 8, 50)}{numberField("topMarginMm", "Top margin · mm", 8, 50)}{numberField("bottomMarginMm", "Bottom margin · mm", 8, 50)}
        </div>
        <label className={styles.inlineCheck}><input type="checkbox" checked={settings.chaptersStartRecto} onChange={(event) => onChange({ chaptersStartRecto: event.target.checked })} />Start chapters on right-hand pages</label>
      </section>
      <section className={styles.settingsSection}>
        <h3 className={styles.sectionTitle}>This edition, in detail.</h3>
        <div className={styles.fieldGrid}>{textField("title", "Book title")}{textField("subtitle", "Subtitle · optional")}{textField("author", "Author")}{textField("publisher", "Publisher / imprint · optional")}{textField("edition", "Edition · optional", "First edition")}{textField("publicationYear", "Publication year · optional", "2026")}</div>
        {textField("isbn", "ISBN-13 · optional", "Your assigned ISBN for this edition")}
        {settings.isbn && !isValidIsbn13(settings.isbn) && <p className={styles.warning} role="status"><AlertCircle size={16} aria-hidden />Check the ISBN: all 13 digits and its checksum must match.</p>}
        <label className={styles.field}>Copyright notice<textarea rows={4} maxLength={4000} value={settings.rightsText} onChange={(event) => onChange({ rightsText: event.target.value })} placeholder="Your copyright notice, credits and permissions." /></label>
      </section>
    </div>
    <aside className={styles.exportCard}>
      <FileCheck2 size={26} aria-hidden /><h3 className={styles.sectionTitle}>From manuscript to book.</h3><p className={styles.help}>Review two separate files: the interior and the complete cover.</p>
      <dl className={styles.measurements}><div><dt>Trim</dt><dd>{settings.trimWidthMm} × {settings.trimHeightMm} mm</dd></div><div><dt>Full cover</dt><dd>{geometry.widthMm === null ? "Spine measurement needed" : `${geometry.widthMm.toFixed(2)} × ${geometry.heightMm.toFixed(2)} mm`}</dd></div><div><dt>Interior pages</dt><dd>{proof?.pageCount ?? "Calculated during export"}</dd></div><div><dt>Book parts</dt><dd>{settings.sections.filter((section) => section.enabled).length} included</dd></div></dl>
      <button type="button" className={styles.primaryButton} disabled={building || !exportAvailable} onClick={onBuild}>{building ? <Loader2 className={styles.spinner} size={17} aria-hidden /> : <FileCheck2 size={17} aria-hidden />}{building ? "Typesetting your book…" : "Generate print proof"}</button>
      {!exportAvailable && <p className={styles.help}>PDF export is not available yet.</p>}
      {proof && <div className={styles.proofDownloads}><a href={proof.interiorUrl} download="book-interior.pdf"><Download size={17} aria-hidden />Interior PDF<span>{proof.pageCount} pages</span></a>{proof.coverUrl && <a href={proof.coverUrl} download="book-cover.pdf"><Download size={17} aria-hidden />Full-cover PDF</a>}{proof.notes.map((note) => <p className={styles.warning} key={note}><AlertCircle size={15} aria-hidden />{note}</p>)}</div>}
      <div className={styles.printNote}><strong>Before you send it to print</strong><p>Check the proof, artwork resolution, printer’s colour requirements and final spine measurement. Request a physical proof before the full run.</p></div>
    </aside>
  </div>;
}
