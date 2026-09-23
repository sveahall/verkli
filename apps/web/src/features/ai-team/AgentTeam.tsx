"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, Check } from "lucide-react";
import { getAudiobookEnabled, getMarketingEnabled, getTranslationsEnabled } from "@/lib/flags";
import AgentAvatar from "./AgentAvatar";
import { agents, getAgentAction } from "./agents";
import styles from "./AgentTeam.module.css";

export default function AgentTeam({ workspace = false, bookId = null, bookTitle, onCreateBook }: {
  workspace?: boolean;
  bookId?: string | null;
  bookTitle?: string;
  onCreateBook?: () => void;
}) {
  const id = useId();
  const [selected, setSelected] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const rail = useRef<HTMLDivElement>(null);
  const userScrolling = useRef(false);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const agent = agents[selected];
  const enabled = { edith: true, alma: getTranslationsEnabled(), august: getAudiobookEnabled(), stella: getMarketingEnabled(), ernst: true };
  const action = getAgentAction(agent.id, bookId, enabled[agent.id], workspace);

  useEffect(() => () => { if (scrollTimer.current) clearTimeout(scrollTimer.current); }, []);

  function select(index: number, focus = false) {
    userScrolling.current = false;
    const next = (index + agents.length) % agents.length;
    setSelected(next);
    if (focus) buttons.current[next]?.focus({ preventScroll: true });
    const button = buttons.current[next];
    const track = rail.current;
    // Scroll only the card rail, never the page or the user's editor.
    if (track && button) {
      const left = button.offsetLeft - (track.clientWidth - button.offsetWidth) / 2;
      track.scrollTo({ left, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    }
  }

  function followSwipe() {
    if (!userScrolling.current) return;
    if (scrollTimer.current) clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => {
      const track = rail.current;
      if (!track || !userScrolling.current) return;
      const atStart = track.scrollLeft < 8;
      const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 8;
      const center = track.scrollLeft + track.clientWidth / 2;
      const nearest = buttons.current.reduce((best, button, index) => {
        if (!button) return best;
        const distance = Math.abs(button.offsetLeft + button.offsetWidth / 2 - center);
        return distance < best.distance ? { index, distance } : best;
      }, { index: 0, distance: Infinity });
      setSelected(atStart ? 0 : atEnd ? agents.length - 1 : nearest.index);
    }, 140);
  }

  function handleKeys(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = event.key === "ArrowRight" ? index + 1 : event.key === "ArrowLeft" ? index - 1 : event.key === "Home" ? 0 : event.key === "End" ? agents.length - 1 : null;
    if (next === null) return;
    event.preventDefault();
    select(next, true);
  }

  function movePortrait(event: PointerEvent<HTMLButtonElement>) {
    if (event.pointerType !== "mouse" || !matchMedia("(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)").matches) return;
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--portrait-x", `${((event.clientX - rect.left) / rect.width - 0.5) * 7}px`);
    event.currentTarget.style.setProperty("--portrait-y", `${((event.clientY - rect.top) / rect.height - 0.5) * 5}px`);
  }

  return (
    <section id="creative-team" className={`${styles.team} ${workspace ? styles.workspace : styles.publicTeam}`} aria-labelledby={`${id}-heading`}>
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>{workspace ? "Your creative team" : "Meet your creative team"}</p>
          <h2 id={`${id}-heading`}>{workspace ? "Who are we working with today?" : <>A whole team.<br /><span>Entirely on your side.</span></>}</h2>
        </div>
        <p>{workspace ? "Pick a person to open the right tools for your book." : "Five familiar faces for the different sides of making a book. Your imagination leads the way."}</p>
      </div>

      <div className={styles.rail} ref={rail} role="group" aria-label="Choose a team member"
        onPointerDown={() => { userScrolling.current = true; }}
        onWheel={() => { userScrolling.current = true; }}
        onScroll={followSwipe}
      >
        {agents.map((item, index) => (
          <button
            key={item.id}
            ref={(element) => { buttons.current[index] = element; }}
            type="button"
            className={styles.card}
            data-agent={item.id}
            aria-pressed={selected === index}
            aria-controls={`${id}-detail`}
            onClick={() => select(index)}
            onKeyDown={(event) => handleKeys(event, index)}
            onPointerMove={movePortrait}
            onPointerLeave={(event) => {
              event.currentTarget.style.removeProperty("--portrait-x");
              event.currentTarget.style.removeProperty("--portrait-y");
            }}
          >
            <span className={styles.cardNumber} aria-hidden="true">0{index + 1}</span>
            <span className={styles.selectedMark} aria-hidden="true">{selected === index ? <Check size={15} /> : <ArrowUpRight size={15} />}</span>
            <AgentAvatar agent={item.id} portrait />
            <span className={styles.identity}><strong>{item.name}</strong><span>{item.role}</span></span>
          </button>
        ))}
      </div>

      <div className={styles.railControls}>
        <span>Choose a person. Find your next step.</span>
        <div><button type="button" aria-label="Previous team member" onClick={() => select(selected - 1)}><ArrowLeft size={17} /></button><span aria-live="off">0{selected + 1} / 05</span><button type="button" aria-label="Next team member" onClick={() => select(selected + 1)}><ArrowRight size={17} /></button></div>
      </div>

      <div id={`${id}-detail`} className={styles.detail} data-agent={agent.id}>
        <div className={styles.detailCopy} aria-live="polite" aria-atomic="true">
          <div key={agent.id} className={styles.reveal}>
            <p className={styles.detailName}>{agent.name} <span>/ {agent.role}</span></p>
            <h3>{agent.headline}</h3>
            <p className={styles.description}>{agent.description}</p>
          </div>
        </div>
        <div className={styles.detailActions}>
          <ul aria-label={`${agent.name}’s workspace`}>
            {agent.tasks.map((task) => <li key={task}><Check size={14} aria-hidden="true" />{task}</li>)}
          </ul>
          {action.kind === "link" ? <Link className={styles.cta} href={action.href}>{action.label}<ArrowUpRight size={17} aria-hidden="true" /></Link>
            : action.kind === "create" ? onCreateBook ? <button type="button" className={styles.cta} onClick={onCreateBook}>{action.label}<ArrowUpRight size={17} aria-hidden="true" /></button> : <Link className={styles.cta} href="/author/library">Choose a book<ArrowUpRight size={17} aria-hidden="true" /></Link>
              : <p className={styles.unavailable}>{action.label}</p>}
          <p className={styles.note}>{workspace && bookId && enabled[agent.id] ? <>Working on <strong>{bookTitle || "your book"}</strong></> : agent.note}</p>
        </div>
      </div>
    </section>
  );
}
