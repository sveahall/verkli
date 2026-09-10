"use client";

import { useEffect, useId, useRef, useState } from "react";
import { motion, useInView, useSpring } from "motion/react";
import { useStudioMotionPreference } from "./useStudioMotionPreference";
import styles from "./AuthorButterfly.module.css";

/** The two original favi.svg paths, hinged where the wings meet. */
export default function AuthorButterfly() {
  const gradient = useId();
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
        <svg viewBox="0 0 205 185" fill="none" className={styles.mark}>
          <defs><radialGradient id={gradient} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(10 184.14) rotate(-43.3375) scale(268.106 235.584)"><stop stopColor="#907AFF" /><stop offset=".360577" stopColor="#E29ED5" /><stop offset=".697115" stopColor="#FCC997" /><stop offset="1" stopColor="#FEE9A3" /></radialGradient></defs>
          <g data-wing="left" className={styles.left}><path d="M76.046 40.1399C57.9009 23.6626 46.6315 14.7511 18.648 14.7517C-38.2622 14.7528 51.7416 172.163 67.8022 181.843C82.1942 190.517 93.5933 166.672 103.362 145.849C109.833 132.057 107.611 68.8039 76.046 40.1399Z" fill={`url(#${gradient})`} /></g>
          <g data-wing="right" className={styles.right}><path d="M187.086 1.82939C163.315 13.3853 144.269 34.1931 128.362 63.3496C113.124 91.2805 108.362 142.33 108.362 142.33C108.514 150.258 113.068 165.617 122.883 177.95C161.741 226.774 239.551 -23.6764 187.086 1.82939Z" fill={`url(#${gradient})`} /></g>
        </svg>
      </span>
    </motion.span>
    <span className={styles.hint}><span className={styles.mouseHint}>Click</span><span className={styles.touchHint}>Tap</span> to fly <span aria-hidden="true">↗</span></span>
  </button>;
}
