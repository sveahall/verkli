"use client";

import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import Image from "next/image";
import { ArrowDown, ArrowRight, AudioLines, Check, FileText, Languages, Pause, Play, RotateCcw, Sparkles } from "lucide-react";
import { sampleWaveforms, storyLanguages, writingVersions, type StoryLanguage } from "./author-experience-data";
import styles from "./AuthorStoryExperience.module.css";

function useNarration(audioRef: RefObject<HTMLAudioElement | null>) {
  const requestRef = useRef(0);
  const [language, setLanguage] = useState<StoryLanguage>("en");
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const sample = storyLanguages.find((item) => item.code === language)!;

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.playbackRate = rate;
  }, [audioRef, language, rate]);

  useEffect(() => {
    const audio = audioRef.current;
    const pauseWhenHidden = () => { if (document.hidden) audio?.pause(); };
    document.addEventListener("visibilitychange", pauseWhenHidden);
    return () => { audio?.pause(); document.removeEventListener("visibilitychange", pauseWhenHidden); };
  }, [audioRef, language]);

  const chooseLanguage = (next: StoryLanguage) => {
    if (language === next) return;
    requestRef.current += 1;
    audioRef.current?.pause();
    setPlaying(false);
    setLoading(false);
    setTime(0);
    setDuration(0);
    setError(null);
    setLanguage(next);
  };

  const showError = () => {
    setPlaying(false);
    setLoading(false);
    setError("We couldn’t play this sample. Try again or choose another language.");
  };

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused || loading) {
      requestRef.current += 1;
      audio.pause();
      setLoading(false);
      return;
    }
    const request = ++requestRef.current;
    setError(null);
    setLoading(true);
    if (audio.error) audio.load();
    if (audio.ended) audio.currentTime = 0;
    try {
      await audio.play();
    } catch {
      if (request === requestRef.current) showError();
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  };

  const seek = (next: number) => {
    const audio = audioRef.current;
    if (!audio || audio.readyState === 0 || !Number.isFinite(audio.duration)) return;
    audio.currentTime = Math.min(audio.duration, Math.max(0, next));
    setTime(audio.currentTime);
  };

  return { language, chooseLanguage, sample, playing, setPlaying, loading, setLoading, time, setTime, duration, setDuration, rate, setRate, error, showError, toggle, seek };
}

const StoryContext = createContext<ReturnType<typeof useNarration> | null>(null);
function useStory() {
  const story = useContext(StoryContext);
  if (!story) throw new Error("Author story controls require AuthorStoryProvider");
  return story;
}

export function AuthorStoryProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const story = useNarration(audioRef);
  return <StoryContext.Provider value={story}>
    {children}
    <audio key={story.language} ref={audioRef} data-author-sample src={`/demo-assets/audio/${story.language}.mp3`} preload="none"
      onPlay={() => story.setPlaying(true)} onPlaying={() => story.setLoading(false)}
      onPause={() => { story.setPlaying(false); story.setLoading(false); }}
      onEnded={() => story.setPlaying(false)} onError={story.showError}
      onLoadedMetadata={(event) => story.setDuration(event.currentTarget.duration)}
      onTimeUpdate={(event) => story.setTime(event.currentTarget.currentTime)} />
  </StoryContext.Provider>;
}

function LanguagePicker({ compact = false }: { compact?: boolean }) {
  const { language, chooseLanguage } = useStory();
  return <div className={`${styles.languagePicker} ${compact ? styles.compactLanguages : ""}`} role="group" aria-label="Choose sample language">
    {storyLanguages.map(({ code, label }) => <button type="button" key={code} aria-label={label} aria-pressed={code === language} onClick={() => chooseLanguage(code)}>
      {compact ? code.toUpperCase() : label}
    </button>)}
  </div>;
}

function clock(seconds: number) {
  const whole = Number.isFinite(seconds) ? Math.floor(seconds) : 0;
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

export function StoryHero() {
  const { sample, playing, loading, toggle, error } = useStory();
  return <div className={styles.heroWorld} data-experience>
    <Image src="/images/verkli-story-world-v1.png" alt="Pages rise from an open book into an imagined world of light, mountains and distant castles." width={1536} height={1024} sizes="(max-width: 1023px) calc(100vw - 40px), (max-width: 1600px) 58vw, 836px" quality={85} priority className={styles.worldImage} />
    <div className={styles.worldShade} />
    <div className={styles.worldTop}><span><span className={styles.liveDot} />Step into a story</span><LanguagePicker compact /></div>
    <div className={styles.heroStory}>
      <p className={styles.sampleLabel}>The Haunted Diary · A Verkli sample</p>
      <p key={sample.code} lang={sample.code} className={styles.heroQuote}>“{sample.closing}”</p>
      <div className={styles.heroStoryFoot}>
        <span>Choose a language.<br />Hear the possibility.</span>
        <button type="button" className={styles.heroPlay} aria-label={playing ? "Pause story sample" : "Play story sample"} aria-busy={loading} onClick={toggle}>
          {playing ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}<span>{loading ? "Loading…" : playing ? "Pause" : "Listen"}</span>
        </button>
      </div>
      {error && <p className={styles.heroError} role="alert">{error}</p>}
    </div>
    <div className={styles.orbitNote} aria-hidden="true"><Sparkles size={16} />One idea. Endless possibility.</div>
  </div>;
}

export function WritingDemo() {
  const [version, setVersion] = useState<keyof typeof writingVersions>("original");
  const passage = writingVersions[version];
  return <section id="writing" aria-label="Writing demo" className={styles.writingSection} data-experience>
    <div className={styles.sectionLead}>
      <p className={styles.kicker}>01 / Find your voice</p>
      <h2>A little spark.<br /><span>A different story.</span></h2>
      <p>You bring the idea. Explore a new rhythm, a sharper sentence, a different way in. The final word is always yours.</p>
      <a href="#writing-controls" className={styles.tryLink}>Go on. Change the story. <ArrowDown size={17} /></a>
      <span className={styles.handNote}>Your imagination takes it from here.</span>
    </div>
    <div className={styles.editor}>
      <div className={styles.editorChrome}><span><Image src="/favi.svg" alt="" width={21} height={21} />Your writing space</span><span>Try a sample</span></div>
      <div className={styles.editorPage}>
        <div className={styles.manuscriptMeta}><span>THE HAUNTED DIARY</span><span>Chapter 01</span></div>
        <h3>The first page.</h3>
        <div className={styles.passageSpace} aria-live="polite" aria-atomic="true"><p data-testid="writing-passage" key={version} className={version === "original" ? "" : styles.rewritten}>{passage}</p></div>
        <div className={styles.editorStatus}><span>{version === "original" ? "Your first draft" : <><Check size={14} />{version === "vivid" ? "A more vivid direction" : "A sharper, shorter version"}</>}</span><span>{passage.split(/\s+/).length} words</span></div>
      </div>
      <div id="writing-controls" className={styles.rewriteControls}>
        <button type="button" aria-pressed={version === "vivid"} onClick={() => setVersion("vivid")}><Sparkles size={16} />Make it vivid</button>
        <button type="button" aria-pressed={version === "concise"} onClick={() => setVersion("concise")}><FileText size={16} />Make it concise</button>
        <button type="button" className={styles.undo} aria-label="Restore original" disabled={version === "original"} onClick={() => setVersion("original")}><RotateCcw size={17} /></button>
      </div>
      <p className={styles.demoNote}>Interactive demo · Prepared writing examples. Your manuscript stays yours.</p>
    </div>
  </section>;
}

export function TranslationDemo() {
  const { sample } = useStory();
  return <section id="translation" aria-label="Translation demo" className={styles.translationSection} data-experience>
    <div className={styles.translationTop}><p className={styles.kicker}>02 / Cross a new border</p><span><Languages size={17} />One story. A new conversation.</span></div>
    <div className={styles.translationHeading}><h2>Your words.<br /><span>A world of readers.</span></h2><div><p>Somewhere, your next reader speaks another language. See how the same story opens a new door.</p><LanguagePicker /></div></div>
    <div className={styles.translationStage}>
      <div className={styles.sourceSentence}><span>THE ORIGINAL IDEA / ENGLISH</span><p>I tried to close it.<br />The cover refused.</p></div>
      <div className={styles.translationBridge} aria-hidden="true"><span /><Languages size={24} /><span /></div>
      <div className={styles.targetSentence} aria-live="polite" aria-atomic="true"><span>{sample.label} <span className={styles.languageCode}>{sample.code.toUpperCase()}</span></span><p key={sample.code} data-testid="translated-passage" lang={sample.code}>{sample.closing}</p></div>
    </div>
    <div className={styles.translationFoot}><span><Check size={15} />Switch the language. Keep the feeling.</span><span>Example translations · Review before publishing</span></div>
  </section>;
}

export function AudioDemo() {
  const { sample, language, playing, loading, toggle, error, time, duration, seek, rate, setRate } = useStory();
  const waveform = sampleWaveforms[language];
  const length = duration || waveform.seconds;
  const progress = Math.min(1, time / length);
  return <section id="audio" aria-label="Audiobook demo" className={styles.audioSection} data-experience>
    <div className={styles.sectionLead}>
      <p className={styles.kicker}>03 / Feel every word</p>
      <h2>That gave you<br /><span>goosebumps?</span></h2>
      <p>Wait until you hear it. Turn a quiet page into a voice that stays with someone, long after the last word.</p>
      <LanguagePicker />
      <p className={styles.audioInvitation}><AudioLines size={18} />Press play. This part is real.</p>
    </div>
    <div className={`${styles.audioPlayer} ${playing ? styles.isPlaying : ""}`}>
      <div className={styles.recordArt} aria-hidden="true"><div className={styles.recordDisc}><div><Image src="/favi.svg" alt="" width={46} height={43} /></div></div><div className={styles.recordSleeve}><span>VERKLI ORIGINAL SAMPLE</span><strong>The<br />Haunted<br />Diary.</strong><span>A STORY THAT WON’T LET GO.</span></div></div>
      <div className={styles.audioMeta}><div><span>NOW PLAYING / {sample.label.toUpperCase()}</span><h3 lang={language}>{sample.title}</h3></div><button type="button" onClick={() => setRate(rate === 1 ? 1.25 : rate === 1.25 ? 1.5 : 1)} aria-label={`Playback speed ${rate} times`}>{rate}×</button></div>
      <div className={styles.waveform} aria-hidden="true">{waveform.peaks.map((peak, index) => <i key={index} style={{ "--peak": peak, "--wave-index": index, background: index / waveform.peaks.length <= progress && time > 0 ? "#fcc997" : undefined } as CSSProperties} />)}</div>
      <input type="range" aria-label="Playback position" min={0} max={length} step={0.1} value={time} disabled={!duration} onChange={(event) => seek(Number(event.target.value))} className={styles.seek} />
      <div className={styles.audioControls}><span>{clock(time)} <span>/ {clock(length)}</span></span><button type="button" className={styles.playButton} aria-label={playing ? "Pause narration" : "Play narration"} aria-busy={loading} onClick={toggle}>{playing ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}{loading ? "Loading…" : playing ? "Pause" : "Play sample"}</button></div>
      {error && <p className={styles.audioError}>{error}</p>}
      <details className={styles.transcript}><summary>Read along <ArrowDown size={14} /></summary><p lang={language}>{sample.passage}</p></details>
      <p className={styles.playerNote}>Recorded AI narration · Plays only when you press play.</p>
    </div>
  </section>;
}

export function ExperienceBridge() {
  return <div className={styles.experienceBridge}><span>IMAGINE IT</span><ArrowRight size={18} /><span>MAKE IT YOURS</span><ArrowRight size={18} /><span>SEND IT FURTHER</span></div>;
}
