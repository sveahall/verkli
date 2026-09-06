"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import Image from "next/image";
import { AudioLines, Languages, PenLine, Sparkles } from "lucide-react";
import AuthorBookCover from "./AuthorBookCover";
import styles from "./AuthorLandingPage.module.css";

const MODES = [
  { id: "writing", label: "Writing", icon: PenLine },
  { id: "translate", label: "Translate", icon: Languages },
  { id: "listen", label: "Listen", icon: AudioLines },
] as const;

type Mode = (typeof MODES)[number]["id"];

export default function AuthorProductPreview() {
  const [mode, setMode] = useState<Mode>("writing");
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  function handleTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    if (event.key === "ArrowRight") next = (index + 1) % MODES.length;
    else if (event.key === "ArrowLeft") next = (index + MODES.length - 1) % MODES.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = MODES.length - 1;
    else return;
    event.preventDefault();
    setMode(MODES[next].id);
    tabs.current[next]?.focus();
  }

  return (
    <div className={styles.workspace}>
      <div className={styles.workspaceHeader}>
        <div className={styles.workspaceIdentity}><Image className={styles.workspaceMark} src="/favi.svg" alt="" width={39} height={35} /><span>The shape of light<span className={styles.workspaceSubheading}>Example manuscript</span></span></div>
        <div className={styles.tabs} role="tablist" aria-label="Explore writing, translation, and audio">
          {MODES.map(({ id, label, icon: Icon }, index) => (
            <button key={id} ref={(node) => { tabs.current[index] = node; }} type="button" role="tab" id={`preview-tab-${id}`} aria-selected={mode === id} aria-controls="preview-panel" tabIndex={mode === id ? 0 : -1} onClick={() => setMode(id)} onKeyDown={(event) => handleTabKey(event, index)}>
              <Icon size={16} aria-hidden="true" />{label}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.workspaceBody}>
        <aside className={styles.manuscriptOutline} aria-label="Example manuscript outline">
          <p>Manuscript</p>
          <span className={styles.outlineTitle}>The shape of light</span>
          <ol><li className={styles.currentChapter}><span>01</span>The arrival</li><li><span>02</span>The keeper’s house</li><li><span>03</span>What the sea kept</li></ol>
          <div className={styles.outlineBottom}><span className={styles.outlineRule} /><span>Every story begins<br />with a little possibility.</span></div>
        </aside>
        <div className={styles.previewPanel} role="tabpanel" id="preview-panel" aria-labelledby={`preview-tab-${mode}`} tabIndex={0}>
          <div className={styles.manuscriptPage}>
            <div className={styles.pageMeta}><span>{mode === "writing" ? "CHAPTER 01" : mode === "translate" ? "ENGLISH → SPANISH" : "AUDIOBOOK STUDIO"}</span><span>{mode === "writing" ? "The arrival" : "Example workflow"}</span></div>
            {mode === "writing" && <>
              <h3 className={styles.manuscriptTitle}>The arrival</h3>
              <div className={styles.prose}><p>The morning the lighthouse went dark, Nora found a letter beneath the door.</p><p>It was folded once, carefully, as though the person who left it had all the time in the world. Outside, the sea moved against the harbour wall.</p><p>She knew the handwriting.<br />She had spent twenty years trying to forget it.</p></div>
              <div className={styles.writingNote}><Sparkles size={16} aria-hidden="true" /><span>A little help shaping the scene.<br /><strong>The final word is always yours.</strong></span></div>
            </>}
            {mode === "translate" && <>
              <h3>A new language.<br />The same beginning.</h3>
              <p className={styles.sourceExcerpt}>“The morning the lighthouse went dark, Nora found a letter beneath the door.”</p>
              <div className={styles.translationExcerpt} lang="es"><span>ESPAÑOL</span><p>La mañana en que el faro se apagó, Nora encontró una carta bajo la puerta.</p><p>Estaba doblada una sola vez, con cuidado, como si quien la había dejado tuviera todo el tiempo del mundo.</p></div>
              <p className={styles.panelNote}>Example translation. Review the language, refine the details, keep your voice.</p>
            </>}
            {mode === "listen" && <>
              <h3>A story worth<br />listening to.</h3>
              <ol className={styles.audioSteps}><li><span>01</span><div><strong>Choose a voice</strong><p>Find a narration style that fits your story.</p></div></li><li><span>02</span><div><strong>Try a chapter</strong><p>Generate a sample from your manuscript.</p></div></li><li><span>03</span><div><strong>Listen and refine</strong><p>Review the pacing before taking it further.</p></div></li></ol>
              <p className={styles.panelNote}>No audio is generated in this preview.</p>
            </>}
          </div>
          <aside className={styles.bookAside} aria-label="Example book edition">
            <AuthorBookCover edition={mode === "translate" ? "spanish" : "original"} className={styles.previewBook} />
            <span className={styles.editionType}>{mode === "writing" ? "Your story, taking shape" : mode === "translate" ? "A new chapter in Spanish" : "From the page to a voice"}</span>
            <p>{mode === "writing" ? "Manuscript · Original example" : mode === "translate" ? "Translation · Illustrated example" : "Audiobook · Workflow preview"}</p>
          </aside>
        </div>
      </div>
      <div className={styles.workspaceFooter}><span><span className={styles.dot} /> Built around your manuscript</span><span>Writing / Translation / Audio</span></div>
    </div>
  );
}
