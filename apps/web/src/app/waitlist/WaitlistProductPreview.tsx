"use client";

import { useState } from "react";
import Image from "next/image";
import { AudioLines, FileText, Languages } from "lucide-react";

const views = [
  { id: "write", label: "Write", icon: FileText, alt: "Verkli writing studio with highlighted manuscript text." },
  { id: "translate", label: "Translate", icon: Languages, alt: "Verkli translation studio showing the same sentence in English, Swedish and Spanish." },
  { id: "audio", label: "Create audio", icon: AudioLines, alt: "Verkli audiobook studio with a narration waveform and chapter preview." },
] as const;

type View = (typeof views)[number]["id"];

/** Illustrative, interactive product story; never starts a paid AI job. */
export default function WaitlistProductPreview() {
  const [view, setView] = useState<View>("write");

  return (
    <div className="wl-product">
      <div id="waitlist-product-view" className="wl-preview-art">
        {views.map(({ id, alt }) => (
          <Image
            key={id}
            src={`/images/waitlist-studio-${id}-v1.png`}
            alt={alt}
            width={1254}
            height={1254}
            sizes="(max-width: 370px) calc(100vw - 32px), (max-width: 540px) calc(100vw - 40px), (max-width: 760px) 500px, (max-width: 1336px) 45vw, 567px"
            quality={90}
            priority={id === "write"}
            loading={id === "write" ? undefined : "eager"}
            hidden={view !== id}
            className="wl-view-in"
          />
        ))}
      </div>
      <div className="wl-preview-controls" role="group" aria-label="Explore the product preview">
        {views.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" aria-pressed={view === id} aria-controls="waitlist-product-view waitlist-product-copy" onClick={() => setView(id)}>
            <Icon size={16} aria-hidden="true" /> {label}
          </button>
        ))}
      </div>
      <div id="waitlist-product-copy" className="wl-preview-copy" aria-live="polite" aria-atomic="true">
        {view === "write" && <><h3>It starts with your imagination.</h3><p>Write, shape and refine your next chapter.</p></>}
        {view === "translate" && <><h3>A new language. Still your story.</h3><p lang="sv">Och det här var bara början.</p></>}
        {view === "audio" && <><h3>Give your words a voice.</h3><p>Audio is illustrated here. This preview has no sound.</p></>}
      </div>
      <p className="wl-preview-disclaimer">Select a view · Illustrative product preview</p>
    </div>
  );
}
