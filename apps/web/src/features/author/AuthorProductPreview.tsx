"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import Image from "next/image";
import { AudioLines, FileText, Languages, PenLine, Sparkles } from "lucide-react";
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
        <div className={styles.workspaceIdentity}><Image className={styles.workspaceMark} src="/favi.svg" alt="" width={39} height={35} /><span>Verkli Studio<span className={styles.workspaceSubheading}>Interactive preview</span></span></div>
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
          <p><FileText size={13} aria-hidden="true" /> Manuscript</p>
          <span className={styles.outlineTitle}>The shape of light</span>
          <ol><li className={styles.currentChapter}><span>01</span>The arrival</li><li><span>02</span>The keeper’s house</li><li><span>03</span>What the sea kept</li></ol>
          <div className={styles.outlineBottom}><Sparkles size={16} aria-hidden="true" /><span>Your imagination.<br />Connected.</span><span className={styles.outlineExample}>Example manuscript</span></div>
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
          <aside className={styles.assistantPanel} aria-label="Illustrative AI assistant examples">
            <div className={styles.assistantHeader}><span className={styles.assistantSymbol}><Sparkles size={18} aria-hidden="true" /></span><span>Creative partner<small>AI, with your voice in mind</small></span></div>
            {mode === "writing" && <>
              <div className={styles.examplePrompt}><span>EXAMPLE PROMPT</span><p>Make the opening more cinematic.</p></div>
              <div className={styles.assistantResponse}><span><Sparkles size={13} aria-hidden="true" /> ILLUSTRATIVE SUGGESTION</span><p>Before the town woke, the lighthouse went dark. At Nora’s door, a letter waited.</p></div>
              <p className={styles.assistantGuidance}>A sharper opening. The same mystery.<br />Take what fits. Make it yours.</p>
            </>}
            {mode === "translate" && <>
              <div className={styles.languageRoute}><span>EN<small>English</small></span><span aria-hidden="true">→</span><span>ES<small>Spanish</small></span></div>
              <div className={styles.assistantResponse}><span><Languages size={13} aria-hidden="true" /> TRANSLATION EXAMPLE</span><p>A new language.<br />Keep the atmosphere.</p></div>
              <p className={styles.assistantGuidance}>The Spanish passage keeps Nora, the lighthouse, and the quiet tension. Review every phrase so the story still sounds like you.</p>
            </>}
            {mode === "listen" && <>
              <div className={styles.assistantWave} aria-hidden="true">{[16, 26, 45, 32, 70, 98, 58, 39, 80, 60, 36, 52, 26, 14].map((height, index) => <i key={index} style={{ height }} />)}</div>
              <div className={styles.assistantResponse}><span><AudioLines size={13} aria-hidden="true" /> NARRATION DIRECTION EXAMPLE</span><p>Quiet suspense.<br />Room for every word.</p></div>
              <p className={styles.assistantGuidance}>Try a measured pace for Nora’s arrival. Leave a pause after the letter, and let the last line land.</p>
            </>}
            <div className={styles.assistantFooter}><span className={styles.dot} /> Your story. Your call.</div>
          </aside>
        </div>
      </div>
      <div className={styles.workspaceFooter}><span><span className={styles.dot} /> Built around your manuscript</span><span>Writing / Translation / Audio</span></div>
    </div>
  );
}
