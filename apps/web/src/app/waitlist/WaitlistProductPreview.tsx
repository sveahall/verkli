"use client";

import { useState } from "react";
import Image from "next/image";
import { ArrowUpRight, AudioLines, Check, FileText, Languages, Sparkles } from "lucide-react";

const views = [
  { id: "write", label: "Write", icon: FileText },
  { id: "translate", label: "Translate", icon: Languages },
  { id: "audio", label: "Create audio", icon: AudioLines },
] as const;

type View = (typeof views)[number]["id"];
const waveform = [14, 22, 38, 25, 52, 69, 41, 28, 56, 80, 62, 35, 48, 72, 92, 65, 40, 24, 49, 78, 57, 34, 64, 87, 51, 28, 46, 70, 39, 21, 35, 58, 76, 42, 27, 16];

/** Illustrative, interactive product story; never starts a paid AI job. */
export default function WaitlistProductPreview() {
  const [view, setView] = useState<View>("write");

  return (
    <div className="wl-product">
      <div className="wl-product-halo" aria-hidden="true" />
      <div className="wl-product-label"><span /> YOUR STORY, IN EVERY DIMENSION</div>
      <div className="wl-studio">
        <div className="wl-studio-bar">
          <span><Image src="/favi.svg" alt="" width={22} height={22} /> Your workspace</span>
          <span className="wl-studio-dots" aria-hidden="true">•••</span>
        </div>
        <div className="wl-preview-controls" role="group" aria-label="Explore the product preview">
          {views.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" aria-pressed={view === id} aria-controls="waitlist-product-view" onClick={() => setView(id)}>
              <Icon size={15} aria-hidden="true" /> {label}
            </button>
          ))}
        </div>
        <div id="waitlist-product-view" className="wl-preview-content" aria-live="polite" aria-atomic="true">
          {view === "write" && (
            <div className="wl-manuscript wl-view-in">
              <div className="wl-document-meta"><span>MANUSCRIPT</span><span>Chapter 01</span></div>
              <h3>It starts with<br />your imagination.</h3>
              <p>The city was still asleep when she opened the window. Somewhere beyond the rooftops, a new world was waiting.</p>
              <p>She had a story to tell.<br /><span className="wl-text-highlight">And this was only the beginning.</span></p>
              <div className="wl-document-footer"><span><FileText size={13} aria-hidden="true" /> Your words. Your next chapter.</span><span className="wl-cursor" aria-hidden="true" /></div>
            </div>
          )}
          {view === "translate" && (
            <div className="wl-translation wl-view-in">
              <div className="wl-document-meta"><span>TRANSLATION STUDIO</span><Languages size={15} aria-hidden="true" /></div>
              <h3>A story that<br />speaks to more people.</h3>
              <div className="wl-language-row"><span>EN</span><div><small>English · original</small><p>And this was only the beginning.</p></div><Check size={15} aria-hidden="true" /></div>
              <div className="wl-language-row"><span>SV</span><div><small>Swedish · translation</small><p lang="sv">Och det här var bara början.</p></div><Check size={15} aria-hidden="true" /></div>
              <div className="wl-language-row"><span>ES</span><div><small>Spanish · translation</small><p lang="es">Y esto era solo el comienzo.</p></div><Check size={15} aria-hidden="true" /></div>
            </div>
          )}
          {view === "audio" && (
            <div className="wl-audio wl-view-in">
              <div className="wl-document-meta"><span>AUDIOBOOK STUDIO</span><AudioLines size={16} aria-hidden="true" /></div>
              <h3>Give your words<br />a voice.</h3>
              <div className="wl-waveform" aria-hidden="true">{waveform.map((height, index) => <span key={index} style={{ height: `${height}%` }} />)}</div>
              <p className="wl-audio-excerpt">“Somewhere beyond the rooftops,<br />a new world was waiting.”</p>
              <div className="wl-audio-caption"><AudioLines size={15} aria-hidden="true" /> Narrated from your manuscript</div>
            </div>
          )}
        </div>
        <div className="wl-studio-footer"><Sparkles size={13} aria-hidden="true" /><span>One workspace. More possibilities.</span><ArrowUpRight size={15} aria-hidden="true" /></div>
      </div>
      <div className="wl-editions" aria-hidden="true">
        <div><FileText size={17} /><span>Ebook</span><span className="wl-edition-dot" /></div>
        <div><Languages size={17} /><span>Translations</span><span className="wl-edition-dot" /></div>
        <div><AudioLines size={17} /><span>Audiobook</span><span className="wl-edition-dot" /></div>
      </div>
      <p className="wl-preview-disclaimer">Explore the tabs · Illustrative product preview</p>
    </div>
  );
}
