"use client";

import { ArrowDown, ArrowUp, FileText, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { createProductionSection, SECTION_TEMPLATES, type ProductionSection, type ProductionSectionKind, type ProductionSettings } from "./model";
import styles from "./ProductionStudio.module.css";

export type ProductionChapter = { id: string; title: string; content: string | null; order: number };
export function ProductionStructure({ settings, chapters, onChange, onOpenWriting }: {
  settings: ProductionSettings;
  chapters: ProductionChapter[];
  onChange: (patch: Partial<ProductionSettings>) => void;
  onOpenWriting?: () => void;
}) {
  const [selectedId, setSelectedId] = useState(settings.sections[0]?.id ?? "");
  const [adding, setAdding] = useState(false);
  const selected = settings.sections.find((section) => section.id === selectedId);
  const automatic = selected && ["title", "copyright", "contents"].includes(selected.kind);
  function update(patch: Partial<ProductionSection>) { onChange({ sections: settings.sections.map((section) => section.id === selectedId ? { ...section, ...patch } : section) }); }
  function add(kind: ProductionSectionKind) { const next = createProductionSection(kind); onChange({ sections: [...settings.sections, next] }); setSelectedId(next.id); setAdding(false); }
  function move(id: string, direction: -1 | 1) {
    const sections = [...settings.sections]; const index = sections.findIndex((section) => section.id === id);
    const sameGroup = sections.map((section, i) => section.placement === sections[index].placement ? i : -1).filter((i) => i >= 0);
    const target = sameGroup[sameGroup.indexOf(index) + direction];
    if (target === undefined) return;
    [sections[index], sections[target]] = [sections[target], sections[index]];
    onChange({ sections });
  }
  function list(placement: "before" | "after") {
    const sections = settings.sections.filter((section) => section.placement === placement);
    return sections.map((section, index) => <div className={`${styles.sectionRow} ${selectedId === section.id ? styles.selectedRow : ""}`} key={section.id}>
      <button type="button" className={styles.sectionPick} onClick={() => setSelectedId(section.id)} aria-pressed={selectedId === section.id}>
        <FileText size={17} aria-hidden /><span><strong>{section.title || SECTION_TEMPLATES.find((item) => item.kind === section.kind)?.label}</strong><small>{section.enabled ? ["title", "copyright", "contents"].includes(section.kind) ? "Built from your book" : "Your words" : "Excluded from print"}</small></span>
      </button>
      <button type="button" className={styles.iconButton} aria-label={`Move ${section.title} up`} disabled={index === 0} onClick={() => move(section.id, -1)}><ArrowUp size={15} aria-hidden /></button>
      <button type="button" className={styles.iconButton} aria-label={`Move ${section.title} down`} disabled={index === sections.length - 1} onClick={() => move(section.id, 1)}><ArrowDown size={15} aria-hidden /></button>
    </div>);
  }
  return <div className={styles.structureLayout}>
    <section className={styles.structureList} aria-label="Book structure">
      <div className={styles.sectionHeading}><h3 className={styles.sectionTitle}>The shape of your book.</h3><span>{settings.sections.filter((part) => part.enabled).length + chapters.length} parts</span></div>
      <p className={styles.help}>Only include the pages your story needs.</p>
      <h4 className={styles.groupLabel}>Before the story</h4>{list("before")}
      <div className={styles.chapterGroup}><div className={styles.sectionHeading}><h4>Manuscript</h4>{onOpenWriting && <button type="button" onClick={onOpenWriting}>Edit chapters ↗</button>}</div>
        {chapters.length ? chapters.map((chapter, index) => <div key={chapter.id}><span>{String(index + 1).padStart(2, "0")}</span>{chapter.title || "Untitled chapter"}</div>) : <p>No chapters yet. Add your manuscript in Write.</p>}
      </div>
      <h4 className={styles.groupLabel}>After the story</h4>{list("after")}
      <button className={styles.secondaryButton} type="button" onClick={() => setAdding(!adding)} aria-expanded={adding}><Plus size={17} aria-hidden />Add a book part</button>
      {adding && <div className={styles.partPicker} aria-label="Choose a book part">{SECTION_TEMPLATES.filter((item) => !["title", "copyright", "contents"].includes(item.kind) || !settings.sections.some((section) => section.kind === item.kind)).map((item) => <button type="button" key={item.kind} onClick={() => add(item.kind)}>{item.label}<Plus size={14} aria-hidden /></button>)}</div>}
    </section>
    <section className={styles.partEditor} aria-label="Selected book part">
      {selected ? <>
        <div className={styles.sectionHeading}><h3 className={styles.sectionTitle}>{SECTION_TEMPLATES.find((item) => item.kind === selected.kind)?.label}</h3><label className={styles.inlineCheck}><input type="checkbox" checked={selected.enabled} onChange={(event) => update({ enabled: event.target.checked })} />Include</label></div>
        <label className={styles.field}>Heading<input value={selected.title} maxLength={180} onChange={(event) => update({ title: event.target.value })} /></label>
        {selected.kind === "title" ? <div className={styles.titlePage}><span>{settings.author || "Author name"}</span><strong>{settings.title || "Your book title"}</strong><em>{settings.subtitle}</em><small>{settings.publisher}</small></div>
          : selected.kind === "copyright" ? <div className={styles.autoPage}><p>{settings.rightsText || "Add your copyright notice in Format & export."}</p><p>{[settings.publisher, settings.edition, settings.publicationYear].filter(Boolean).join(" · ")}</p><p>{settings.isbn ? `ISBN ${settings.isbn}` : "ISBN not entered"}</p></div>
          : selected.kind === "contents" ? <div className={styles.autoPage}><h4>{selected.title}</h4>{[...settings.sections.filter((part) => part.enabled && part.placement === "before" && !["title", "copyright", "contents"].includes(part.kind)).map((part) => part.title), ...chapters.map((chapter) => chapter.title), ...settings.sections.filter((part) => part.enabled && part.placement === "after").map((part) => part.title)].map((title, index) => <div className={styles.contentsLine} key={`${index}-${title}`}><span>{title}</span><span>—</span></div>)}<p className={styles.help}>Page numbers are calculated from the typeset interior when you generate the PDF.</p></div>
          : <label className={styles.field}>Your text<textarea rows={16} maxLength={50000} value={selected.body} onChange={(event) => update({ body: event.target.value })} placeholder="Make this page your own. Separate paragraphs with a blank line." /></label>}
        {!automatic && <label className={styles.field}>Position<select value={selected.placement} onChange={(event) => update({ placement: event.target.value as "before" | "after" })}><option value="before">Before the manuscript</option><option value="after">After the manuscript</option></select></label>}
        <label className={styles.inlineCheck}><input type="checkbox" checked={selected.startRecto} onChange={(event) => update({ startRecto: event.target.checked })} />Start on a right-hand page</label>
        <p className={styles.help}>A blank left-hand page is inserted when needed.</p>
        {!automatic && <button type="button" className={styles.removeButton} onClick={() => { onChange({ sections: settings.sections.filter((part) => part.id !== selectedId) }); setSelectedId(""); }}><Trash2 size={15} aria-hidden />Remove this part</button>}
      </> : <div className={styles.empty}><FileText size={30} aria-hidden /><h3>Select a book part</h3><p>Write a foreword, add a dedication, or give readers a little more at the end.</p></div>}
    </section>
  </div>;
}
