"use client";

import { useEffect, useId, useRef, useState } from "react";
import { motion, useInView, useSpring } from "motion/react";
import { useStudioMotionPreference } from "./useStudioMotionPreference";
import styles from "./AuthorButterfly.module.css";

/** The approved butterfly artwork, clipped into two independently hinged wings. */
export default function AuthorButterfly() {
  const wingClip = useId();
  const ref = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inView = useInView(ref, { amount: 0.5 });
  const reduceMotion = useStudioMotionPreference();
  const [flight, setFlight] = useState(0);
  const [flying, setFlying] = useState(false);
  const rotateX = useSpring(0, { stiffness: 100, damping: 20 });
  const rotateY = useSpring(0, { stiffness: 100, damping: 20 });

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return <button ref={ref} type="button" className={styles.butterfly}
    aria-label="Let the Verkli butterfly fly" data-flying={flying} data-visible={inView}
    onClick={() => {
      if (timer.current) clearTimeout(timer.current);
      setFlight((value) => value + 1);
      setFlying(true);
      timer.current = setTimeout(() => setFlying(false), 1700);
    }}
    onPointerMove={(event) => {
      if (reduceMotion || event.pointerType !== "mouse" || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
      const box = event.currentTarget.getBoundingClientRect();
      rotateY.set(((event.clientX - box.left) / box.width - 0.5) * 24);
      rotateX.set(-((event.clientY - box.top) / box.height - 0.5) * 16);
    }}
    onPointerLeave={() => { rotateX.set(0); rotateY.set(0); }}>
    <span className={styles.light} aria-hidden="true" />
    <span className={styles.shadow} aria-hidden="true" />
    <motion.span className={styles.body} style={reduceMotion ? undefined : { rotateX, rotateY }} aria-hidden="true">
      <span key={flight} className={styles.lift}>
        <svg viewBox="0 0 588 500" fill="none" className={styles.mark}>
          <defs>
            <clipPath id={`${wingClip}-left`}><rect width="324" height="500" /></clipPath>
            <clipPath id={`${wingClip}-right`}><rect x="324" width="264" height="500" /></clipPath>
          </defs>
          <g data-wing="left" className={styles.left}><image href="/verkli-mark.png?v=20260915" width="588" height="500" clipPath={`url(#${wingClip}-left)`} /></g>
          <g data-wing="right" className={styles.right}><image href="/verkli-mark.png?v=20260915" width="588" height="500" clipPath={`url(#${wingClip}-right)`} /></g>
        </svg>
      </span>
    </motion.span>
    <span className={styles.hint}><span className={styles.mouseHint}>Click</span><span className={styles.touchHint}>Tap</span> to fly <span aria-hidden="true">↗</span></span>
  </button>;
}
