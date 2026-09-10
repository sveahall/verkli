"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode, type RefObject, type KeyboardEvent, type PointerEvent } from "react";
import Image from "next/image";
import { ArrowRight, AudioLines, BookOpen, Check, ChevronRight, FileText, Languages, Pause, Play, RotateCcw, Sparkles, X } from "lucide-react";
import { AnimatePresence, motion, useInView } from "motion/react";
import { sampleWaveforms, storyLanguages, writingVersions, type StoryLanguage } from "./author-experience-data";
import styles from "./AuthorStoryExperience.module.css";
import { StudioSurface, TurningBook } from "./AuthorLandingMotion";

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

  const chooseLanguage = useCallback((next: StoryLanguage) => {
    if (language === next) return;
    requestRef.current += 1;
    audioRef.current?.pause();
    setPlaying(false);
    setLoading(false);
    setTime(0);
    setDuration(0);
    setError(null);
    setLanguage(next);
  }, [audioRef, language]);

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

  const pause = useCallback(() => {
    requestRef.current += 1;
    audioRef.current?.pause();
    setPlaying(false);
    setLoading(false);
  }, [audioRef]);

  const seek = (next: number) => {
    const audio = audioRef.current;
    if (!audio || audio.readyState === 0 || !Number.isFinite(audio.duration)) return;
    audio.currentTime = Math.min(audio.duration, Math.max(0, next));
    setTime(audio.currentTime);
  };

  return { language, chooseLanguage, sample, playing, setPlaying, loading, setLoading, time, setTime, duration, setDuration, rate, setRate, error, showError, toggle, seek, pause };
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

const stages = [
  { label: "Write", icon: FileText, caption: "A first draft. A fresh perspective.", number: "01" },
  { label: "Translate", icon: Languages, caption: "The same feeling. In another language.", number: "02" },
  { label: "Listen", icon: AudioLines, caption: "Your words, with a voice of their own.", number: "03" },
  { label: "Publish", icon: BookOpen, caption: "From your imagination. Into their hands.", number: "04" },
];

function LanguagePicker() {
  const { language, chooseLanguage } = useStory();
  return <div className={styles.languages} role="group" aria-label="Choose sample language">
    {storyLanguages.map(({ code, label }) => <button type="button" key={code} aria-pressed={code === language} onClick={() => chooseLanguage(code)}>{label}</button>)}
  </div>;
}

function clock(seconds: number) {
  const whole = Number.isFinite(seconds) ? Math.floor(seconds) : 0;
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

const stageHashes = ["#writing", "#translation", "#audio", "#publishing"];
function hashStage() { return typeof window === "undefined" ? -1 : stageHashes.indexOf(window.location.hash); }

function subscribeToMotionPreference(onChange: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const reduceMotionOnServer = () => true;

export function AuthorStudioExperience() {
  const story = useStory();
  const reduceMotion = useSyncExternalStore(subscribeToMotionPreference, prefersReducedMotion, reduceMotionOnServer);
  const studioRef = useRef<HTMLDivElement>(null);
  const inView = useInView(studioRef, { amount: 0.35 });
  const [stage, setStage] = useState(() => Math.max(0, hashStage()));
  const [direction, setDirection] = useState(1);
  const [tour, setTour] = useState(() => hashStage() === -1);
  const [title, setTitle] = useState("The Haunted Diary");
  const [draft, setDraft] = useState<string>(writingVersions.original);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [previous, setPrevious] = useState<string | null>(null);
  const [openBook, setOpenBook] = useState(false);
  const [cover, setCover] = useState("midnight");
  const swipeStart = useRef<{ id: number; x: number; y: number; time: number } | null>(null);
  const isSample = Object.values(writingVersions).some((text) => text === draft);
  const sampleIsExact = draft === writingVersions.vivid;

  const chooseLanguage = story.chooseLanguage;
  const pause = story.pause;

  useEffect(() => {
    const followHash = () => {
      const next = hashStage();
      if (next < 0) return;
      setDirection(0);
      setStage(next);
      setTour(false);
      pause();
      studioRef.current?.scrollIntoView({ block: "start", behavior: "instant" });
    };
    const frame = requestAnimationFrame(followHash);
    window.addEventListener("hashchange", followHash);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("hashchange", followHash); };
  }, [pause]);

  useEffect(() => {
    if (!tour || reduceMotion || !inView) return;
    const timer = window.setInterval(() => {
      if (!document.hidden && window.matchMedia("(min-width: 801px)").matches) {
        const next = (stage + 1) % stages.length;
        setDirection(1);
        setStage(next);
        if (next === 1) chooseLanguage("sv");
      }
    }, 7200);
    return () => window.clearInterval(timer);
  }, [tour, reduceMotion, inView, stage, chooseLanguage]);

  const selectStage = (next: number, travel = Math.sign(next - stage)) => {
    setTour(false);
    story.pause();
    setDirection(travel);
    setStage(next);
    if (next === 1 && story.language === "en") story.chooseLanguage("sv");
  };
  const handleTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = event.key === "ArrowRight" ? (index + 1) % 4 : event.key === "ArrowLeft" ? (index + 3) % 4 : event.key === "Home" ? 0 : event.key === "End" ? 3 : null;
    if (next === null) return;
    event.preventDefault();
    selectStage(next, 0);
    document.getElementById(`studio-tab-${next}`)?.focus();
  };
  const startSwipe = (event: PointerEvent<HTMLDivElement>) => {
    swipeStart.current = null;
    if (event.pointerType !== "touch" || !event.isPrimary) return;
    if (event.target instanceof Element && event.target.closest("button, a, input, textarea, select, [role=slider], [contenteditable=true]")) return;
    swipeStart.current = { id: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now() };
  };
  const finishSwipe = (event: PointerEvent<HTMLDivElement>) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) >= 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && performance.now() - start.time < 900) {
      selectStage((stage + (dx < 0 ? 1 : 3)) % stages.length, dx < 0 ? 1 : -1);
    }
  };
  const loadSample = () => {
    setDraft(writingVersions.vivid);
    setSuggestion(null);
    setPrevious(null);
  };
  const customNotice = <div className={styles.customNotice}><FileText size={28} /><h3>Your own words are saved in this preview.</h3><p>Translations and narration here use a prepared example. Load it to explore, or open Publish to see your own writing in the reader.</p><button type="button" onClick={loadSample}>Load the sample <ArrowRight size={16} /></button></div>;
  const waveform = sampleWaveforms[story.language];
  const duration = story.duration || waveform.seconds;
  const shownTitle = title.trim() || "Your untitled story";

  return <div id="studio" ref={studioRef} className={styles.experience}>
    {stageHashes.map((hash) => <span key={hash} id={hash.slice(1)} className={styles.anchor} aria-hidden="true" />)}
    <StudioSurface reduceMotion={reduceMotion}>
    <div className={styles.studio} data-stage={stage} onPointerDownCapture={(event) => { if (!(event.target instanceof Element && event.target.closest("[data-tour-control]"))) setTour(false); }} onKeyDownCapture={(event) => { if (!(event.target instanceof Element && event.target.closest("[data-tour-control]"))) setTour(false); }}>
      <div className={styles.chrome}>
        <div className={styles.wordmark}><Image src="/favi.svg" alt="" width={26} height={26} /><strong>verkli</strong><span>/</span><span>Studio</span></div>
        <div className={styles.chromeRight}><span className={styles.sampleBadge}>Make yourself at home.</span>{!reduceMotion && <button data-tour-control type="button" aria-label={tour ? "Pause tour" : "Play tour"} onClick={() => { story.pause(); setTour((value) => !value); }}>{tour && !reduceMotion ? <Pause size={13} /> : <Play size={13} />}<span>{tour ? "Pause tour" : "Play tour"}</span></button>}</div>
      </div>
      <div className={styles.stageNav}>
        <div role="tablist" aria-label="Explore your studio" className={styles.tabs} data-touring={tour && !reduceMotion && inView}>
          {stages.map(({ label, icon: Icon }, index) => <button key={label} id={`studio-tab-${index}`} role="tab" type="button" aria-selected={stage === index} aria-controls="studio-panel" tabIndex={stage === index ? 0 : -1} onClick={() => selectStage(index)} onKeyDown={(event) => handleTabKey(event, index)}>
            {stage === index && <motion.span className={styles.activeTab} layoutId="studio-active-tab" transition={{ duration: reduceMotion ? 0 : 0.18, ease: "easeOut" }} />}
            <Icon size={17} /><span>{label}</span><span className={styles.tabNumber} aria-hidden="true">0{index + 1}</span>
          </button>)}
        </div>
        <span className={styles.stageHint}>{stages[stage].caption}</span>
      </div>
      <div id="studio-panel" role="tabpanel" aria-labelledby={`studio-tab-${stage}`} className={styles.panel} onPointerDown={startSwipe} onPointerUp={finishSwipe} onPointerCancel={() => { swipeStart.current = null; }}>
        <AnimatePresence initial={false} mode="wait" custom={direction}>
          <motion.div key={stage} custom={direction} variants={{ enter: (travel: number) => ({ opacity: 0, x: reduceMotion ? 0 : travel * 36 }), visible: { opacity: 1, x: 0 }, leave: (travel: number) => ({ opacity: 0, x: reduceMotion ? 0 : travel * -22 }) }} initial="enter" animate="visible" exit="leave" transition={{ duration: reduceMotion ? 0 : 0.24, ease: [0.23, 1, 0.32, 1] }} className={styles.panelContent}>
            {stage === 0 && <div className={styles.writeLayout}>
              <aside className={styles.manuscriptNav} aria-label="Example manuscript"><span className={styles.sidebarLabel}>Manuscript</span><div className={styles.manuscriptIcon} aria-hidden="true"><FileText size={26} strokeWidth={1} /></div><strong>{shownTitle}</strong><span className={styles.draftBadge}>Draft</span><div className={styles.chapterActive}><FileText size={14} /><span>The first page</span><span>01</span></div><p>Every great book<br />starts somewhere.</p></aside>
              <div className={styles.paper}>
                <div className={styles.paperToolbar}><span>Chapter 01 <ChevronRight size={12} /> The first page</span><span>Local preview</span></div>
                <div className={styles.pageBody}>
                  <label className={styles.fieldLabel} htmlFor="studio-title">Book title</label><input id="studio-title" aria-label="Book title" maxLength={80} value={title} onChange={(event) => setTitle(event.target.value)} className={styles.titleInput} />
                  <span className={styles.chapterLabel}>Chapter one</span><h3>The first page.</h3>
                  <textarea aria-label="Your manuscript" value={draft} maxLength={3000} spellCheck={false} onChange={(event) => { setDraft(event.target.value); setSuggestion(null); setPrevious(null); }} className={styles.manuscript} />
                  <div className={styles.paperFoot}><span>{draft.trim() ? draft.trim().split(/\s+/).length : 0} words</span><span>Your words. Your final say.</span></div>
                </div>
              </div>
              <aside className={styles.assistant} aria-label="Writing assistant sample">
                <div className={styles.assistantHeading}><Image src="/favi.svg" alt="" width={28} height={28} /><div><strong>A fresh perspective.</strong><span>Still unmistakably you.</span></div></div>
                <AnimatePresence mode="wait" initial={false}>
                  {suggestion ? <motion.div key="suggestion" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={styles.suggestion}><span className={styles.sidebarLabel}>Suggested edit</span><p data-testid="suggested-passage">{suggestion}</p><button type="button" className={styles.applyButton} onClick={() => { setPrevious(draft); setDraft(suggestion); setSuggestion(null); }}><Check size={16} />Use this version</button><button type="button" className={styles.dismissButton} onClick={() => setSuggestion(null)}>Keep my draft</button></motion.div> : <motion.div key="tools" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={styles.assistantTools}><p>A stronger opening?<br />A little more atmosphere?<br />Try a different direction.</p><button type="button" disabled={!isSample} onClick={() => setSuggestion(writingVersions.vivid)}><Sparkles size={16} />Make it vivid <ArrowRight size={15} /></button><button type="button" disabled={!isSample} onClick={() => setSuggestion(writingVersions.concise)}><FileText size={16} />Make it concise <ArrowRight size={15} /></button>{previous !== null && <button type="button" onClick={() => { setDraft(previous); setPrevious(null); }}><RotateCcw size={15} />Undo edit</button>}{!isSample && <div className={styles.customTip}><p>Try prepared edits with the sample, or take your own text to Publish.</p><button type="button" onClick={loadSample}>Load the sample</button></div>}</motion.div>}
                </AnimatePresence>
                <p className={styles.assistantNote}>Prepared examples. Nothing is sent or generated.</p>
              </aside>
            </div>}
            {stage === 1 && <div className={styles.translateLayout}>
              {!isSample ? customNotice : <><div className={styles.translationHeader}><div><span className={styles.sidebarLabel}>Translation</span><h3>A new language.<br /><span>The same story.</span></h3></div><LanguagePicker /></div><div className={styles.parallelPages}><article><span className={styles.languageHeading}>EN <span>Original · English</span></span><h4>The first page.</h4><p>{writingVersions.vivid}</p></article><div className={styles.translateArrow}><Languages size={20} /></div><article className={styles.translatedPage}><span className={styles.languageHeading}>{story.language.toUpperCase()} <span>{story.sample.label} · Prepared translation</span></span><h4 lang={story.language}>{story.sample.title}</h4><AnimatePresence mode="wait"><motion.p key={story.language} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : 0.15 }} data-testid="translated-passage" lang={story.language}>{story.sample.passage}</motion.p></AnimatePresence></article></div><p className={styles.stageNote}>{sampleIsExact ? "Your sample manuscript, in four languages." : "Translations of the vivid sample version."} Review every edition before publishing.</p></>}
            </div>}
            {stage === 2 && <div className={styles.listenLayout}>
              {!isSample ? customNotice : <><div className={styles.listenIntro}><span className={styles.sidebarLabel}>Audiobooks</span><h3>Wait until<br /><span>you hear it.</span></h3><p>A quiet page becomes a voice.<br />Choose a language. Press play.</p><LanguagePicker /><span className={styles.recordingNote}>Recorded AI narration · Sample excerpt</span></div><div className={styles.player}><div className={styles.playerHeader}><div className={styles.soundEmblem}><AudioLines size={25} /></div><div><span>THE FIRST PAGE / {story.sample.label.toUpperCase()}</span><h4>{story.sample.title}</h4></div><button type="button" onClick={() => story.setRate(story.rate === 1 ? 1.25 : story.rate === 1.25 ? 1.5 : 1)} aria-label={`Playback speed ${story.rate} times`}>{story.rate}×</button></div><div className={`${styles.waveform} ${story.playing ? styles.playing : ""}`} aria-hidden="true">{waveform.peaks.map((peak, index) => <i key={index} style={{ "--peak": peak, "--index": index, "--played": index / waveform.peaks.length <= story.time / duration && story.time > 0 ? 1 : 0 } as CSSProperties} />)}</div><input className={styles.seek} type="range" aria-label="Playback position" min={0} max={duration} step={0.1} value={story.time} disabled={!story.duration} onChange={(event) => story.seek(Number(event.target.value))} /><div className={styles.playerControls}><span>{clock(story.time)} <span>/ {clock(duration)}</span></span><button type="button" className={styles.playButton} aria-label={story.playing ? "Pause narration" : "Play narration"} aria-busy={story.loading} onClick={story.toggle}>{story.playing ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}<span>{story.loading ? "Loading…" : story.playing ? "Pause" : "Play narration"}</span></button></div>{story.error && <p className={styles.audioError} role="alert">{story.error}</p>}<p className={styles.readAlong} lang={story.language}>{story.sample.passage}</p><span className={styles.stageNote}>{sampleIsExact ? "Your sample, narrated." : "Narration of the vivid sample version."} Audio plays only when you press play.</span></div></>}
            </div>}
            {stage === 3 && <div className={styles.publishLayout}>
              <div className={styles.publishIntro}><span className={styles.sidebarLabel}>Made to be read.</span><h3>This is where<br /><span>it becomes a book.</span></h3><p>Your title. Your words.<br />See them from the other side of the page.</p><div className={styles.coverControls} role="group" aria-label="Book cover colour">{["violet", "midnight", "apricot"].map((color) => <button type="button" key={color} className={styles[color]} aria-label={`${color.charAt(0).toUpperCase() + color.slice(1)} cover`} aria-pressed={cover === color} onClick={() => setCover(color)}>{cover === color && <Check size={17} />}</button>)}<span>Make it yours</span></div><button type="button" className={styles.openBookButton} onClick={() => setOpenBook(!openBook)}>{openBook ? <X size={17} /> : <BookOpen size={17} />}{openBook ? "Close the book" : "Open the book"}<ArrowRight size={17} /></button><span className={styles.stageNote}>A local reader preview. Nothing is published.</span></div>
              <div className={`${styles.bookStage} ${styles[cover]}`}><AnimatePresence mode="wait" initial={false}>{openBook ? <motion.div key="reader" className={styles.reader} initial={{ opacity: 0, rotateY: reduceMotion ? 0 : -12 }} animate={{ opacity: 1, rotateY: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}><div className={styles.readerChrome}><BookOpen size={17} /><span>{shownTitle}</span><span>01</span></div><span className={styles.chapterLabel}>Chapter one</span><h4>The first page.</h4><p data-testid="reader-passage">{draft.trim() || "Your story starts here. Head back to Write and add your first words."}</p><div className={styles.readerFoot}>A story by you.<span>1</span></div></motion.div> : <TurningBook key="cover" className={styles.book} reduceMotion={reduceMotion}><div className={styles.bookPages} /><div className={styles.bookCover}><div className={styles.coverMeta}><span>A STORY BY YOU</span><Image src="/favi.svg" alt="" width={24} height={24} /></div><h4 data-testid="book-preview-title">{shownTitle}</h4><div className={styles.coverArt} aria-hidden="true" /><span className={styles.coverFoot}>EVERY STORY OPENS A WORLD.</span></div></TurningBook>}</AnimatePresence>{!openBook && <span className={styles.turnHint}>Drag to turn · Arrow keys work too</span>}</div>
            </div>}
          </motion.div>
        </AnimatePresence>
      </div>
      <div className={styles.statusBar}><span>{isSample ? "Sample manuscript" : "Your local draft"}</span><span className={styles.swipeHint}>Swipe to explore</span><span>{stages[stage].number} <span>/ 04</span></span></div>
    </div>
    </StudioSurface>
    <div className={styles.belowStudio}><p>Your words. <span>Take them somewhere new.</span></p><span>Interactive preview · Prepared examples · No account needed</span></div>
  </div>;
}
