"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ArrowUpRight, AudioLines, BookOpen, FileText, Languages, Plus } from "lucide-react";
import styles from "./AuthorLandingSections.module.css";
import { AuthorScrollStatement, UnfoldSection } from "./AuthorLandingMotion";
import AuthorButterfly from "./AuthorButterfly";

const questions = [
  {
    title: "Who is Verkli for?",
    answer: "Verkli is for authors who want to bring a manuscript to life, and readers who want to discover their work. The author studio brings writing, translation, audiobook creation and publishing into one place.",
  },
  {
    title: "Can I bring a manuscript I have already written?",
    answer: "Yes. Import an existing manuscript and work on its chapters in the editor. You can also start with a blank page and build your story in Verkli.",
  },
  {
    title: "Does AI write the book for me?",
    answer: "You lead the creative work. Use AI tools to help refine text, translate chapters or create narration, then review the results before publishing.",
  },
  {
    title: "How do I get access?",
    answer: "Verkli is in private pre-launch. Join the author waitlist and we will contact you as invitations become available. Already invited? Sign in to open your workspace.",
  },
];

const possibilities = [
  { icon: FileText, title: "Find your flow.", detail: "Bring your manuscript or begin with a blank page. Shape each chapter in a focused editor, with AI support when you want another perspective.", label: "WRITE", id: "writing" },
  { icon: Languages, title: "Open another world.", detail: "Create a translated edition, review it chapter by chapter, and give your story a way to reach readers in another language.", label: "TRANSLATE", id: "translation" },
  { icon: AudioLines, title: "Make every word heard.", detail: "Turn written chapters into narrated audio. Choose a voice, listen back, and refine the result before sharing your audiobook.", label: "CREATE AUDIO", id: "audio" },
  { icon: BookOpen, title: "Meet your readers.", detail: "Prepare your book page and publish on Verkli, where readers can discover, read and listen to the work you have made.", label: "PUBLISH", id: "publishing" },
];

export default function AuthorLandingSections() {
  const [openFeature, setOpenFeature] = useState(0);
  const sectionRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const scrollChapter = useRef(0);
  const manualSelection = useRef<{ chapter: number; y: number } | null>(null);
  const swipe = useRef<{ id: number; x: number; y: number; time: number } | null>(null);
  const swiped = useRef(false);
  const chooseFeature = (index: number) => {
    manualSelection.current = { chapter: scrollChapter.current, y: window.scrollY };
    setOpenFeature(index);
  };
  const nextFeature = (direction: number) => chooseFeature((Math.max(0, openFeature) + direction + possibilities.length) % possibilities.length);

  useEffect(() => {
    const section = sectionRef.current;
    const list = listRef.current;
    if (!section || !list) return;
    const pinned = window.matchMedia("(min-width: 1101px) and (min-height: 800px)");
    let frame = 0;
    const updateChapter = () => {
      frame = 0;
      const bounds = section.getBoundingClientRect();
      // The desktop scene has a fixed scroll distance, independent of the open panel's height.
      const progress = pinned.matches
        ? (145 - 55 - bounds.top) / Math.max(1, bounds.height - window.innerHeight)
        : (window.innerHeight * .5 - list.getBoundingClientRect().top) / Math.max(360, window.innerHeight * .5);
      const chapter = Math.min(possibilities.length - 1, Math.max(0, Math.floor(progress * possibilities.length)));
      scrollChapter.current = chapter;
      const manual = manualSelection.current;
      if (manual && (chapter === manual.chapter || Math.abs(window.scrollY - manual.y) < 60)) return;
      manualSelection.current = null;
      // Never collapse the link a keyboard user is currently reading or activating.
      if (list.querySelector("details[open] > p")?.contains(document.activeElement)) return;
      setOpenFeature((current) => current === chapter ? current : chapter);
    };
    const scheduleUpdate = () => { if (!frame) frame = window.requestAnimationFrame(updateChapter); };
    const resize = new ResizeObserver(scheduleUpdate);
    resize.observe(section);
    resize.observe(list);
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    scheduleUpdate();
    return () => {
      window.cancelAnimationFrame(frame);
      resize.disconnect();
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, []);
  const finishSwipe = (event: PointerEvent<HTMLDivElement>) => {
    const start = swipe.current;
    swipe.current = null;
    if (!start || event.pointerId !== start.id) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) >= 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && event.timeStamp - start.time < 900) {
      swiped.current = true;
      nextFeature(dx < 0 ? 1 : -1);
    }
  };
  return <div className={styles.sections}>
    <AuthorScrollStatement />
    <section ref={sectionRef} id="possibilities" className={styles.possibilities} aria-labelledby="possibilities-title">
      <div className={styles.possibilityIntro}><h2 id="possibilities-title">A little less friction.<br /><span>A lot more possibility.</span></h2><p>Less moving between tools.<br />More moving the story forward.</p><a href="#studio" className={styles.textLink}>Experience the workspace <ArrowUpRight size={17} /></a></div>
      <div ref={listRef} className={styles.possibilityList} role="group" aria-label="Explore what you can create" data-chapter={openFeature}
        onPointerDown={(event) => {
          swiped.current = false;
          swipe.current = null;
          if (event.pointerType !== "touch" || !event.isPrimary || (event.target instanceof Element && event.target.closest("a,button"))) return;
          swipe.current = { id: event.pointerId, x: event.clientX, y: event.clientY, time: event.timeStamp };
        }}
        onPointerUp={finishSwipe} onPointerCancel={() => { swipe.current = null; }}
        onClickCapture={(event) => { if (swiped.current && event.detail > 0) { event.preventDefault(); event.stopPropagation(); swiped.current = false; } }}>
        {possibilities.map(({ title, detail, label, id }, index) => <details key={id} open={openFeature === index}>
          <summary role="button" aria-expanded={openFeature === index} onClick={(event) => { event.preventDefault(); chooseFeature(openFeature === index ? -1 : index); }}><span className={styles.possibilityNumber}>0{index + 1}</span><div><h3>{title}</h3></div><Plus size={20} /></summary>
          <p>{detail}<a href={`#${id}`} className={styles.textLink}>Explore {label === "WRITE" ? "writing" : label === "TRANSLATE" ? "translation" : label === "CREATE AUDIO" ? "audio" : "publishing"} <ArrowUpRight size={17} /></a></p>
        </details>)}
        <div className={styles.chapterControls}><span>Keep exploring <span className={styles.chapterSwipe}>· swipe a chapter</span></span><div><button type="button" aria-label="Previous chapter" onClick={() => nextFeature(-1)}><ArrowLeft size={17} /></button><span aria-live="polite">{openFeature < 0 ? "—" : `0${openFeature + 1}`} / 04</span><button type="button" aria-label="Next chapter" onClick={() => nextFeature(1)}><ArrowRight size={17} /></button></div></div>
      </div>
    </section>
    <UnfoldSection>
    <section id="invitation" className={styles.invitation} aria-labelledby="author-invitation-title">
      <div className={styles.invitationTop}><p>Consider this your invitation.</p><span>For the stories only you can tell.</span></div>
      <div className={styles.invitationBody}><div><h2 id="author-invitation-title">A new chapter.<br /><span>And you’re invited.</span></h2><p>We’re opening Verkli to authors in small waves.<br />Bring your imagination. Be part of what comes next.</p><Link href="/waitlist" className={styles.invitationButton}>Get early access <ArrowUpRight size={18} /></Link></div><div className={styles.brandSculpture}><AuthorButterfly /></div></div>
      <div className={styles.invitationFoot}><span>Your ideas. Your voice. Your Verkli.</span><Link href="/author/signin">Already invited? Sign in <ArrowRight size={15} /></Link></div>
    </section>
    </UnfoldSection>
    <section className={styles.faq} aria-labelledby="author-questions-title"><div><h2 id="author-questions-title">A little more<br />about Verkli.</h2><Link href="/faq" className={styles.textLink}>All questions <ArrowUpRight size={17} /></Link></div><div className={styles.questions}>{questions.map(({ title, answer }) => <details key={title}><summary>{title}<Plus size={18} /></summary><p>{answer}</p></details>)}</div></section>
  </div>;
}
