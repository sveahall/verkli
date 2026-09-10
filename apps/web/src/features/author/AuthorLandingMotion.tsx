"use client";

import { useRef, useState, type ReactNode } from "react";
import { motion, useMotionTemplate, useMotionValue, useScroll, useSpring, useTransform } from "motion/react";
import { useStudioMotionPreference } from "./useStudioMotionPreference";
import styles from "./AuthorLandingSections.module.css";

const spring = { stiffness: 120, damping: 26, mass: 0.7 };

/** The presentation moves; once someone starts working, the editor stays still. */
export function StudioSurface({ children, reduceMotion }: { children: ReactNode; reduceMotion: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [settled, setSettled] = useState(false);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "start 0.15"] });
  const reveal = useSpring(scrollYProgress, spring);
  const pitch = useTransform(reveal, [0, 1], [8, 0]);
  const rise = useTransform(reveal, [0, 1], [48, 0]);
  const scale = useTransform(reveal, [0, 1], [0.94, 1]);
  const pointer = useMotionValue(0);
  const yaw = useSpring(pointer, spring);
  const lightX = useSpring(50, spring);
  const lightY = useSpring(35, spring);
  const horizonX = useTransform(lightX, [0, 100], [-32, 32]);
  const transform = useMotionTemplate`perspective(1800px) translateY(${rise}px) rotateX(${pitch}deg) rotateY(${yaw}deg) scale(${scale})`;
  const reflection = useMotionTemplate`radial-gradient(ellipse at ${lightX}% ${lightY}%, #e29ed560, #907aff24 42%, transparent 72%)`;
  const rim = useMotionTemplate`radial-gradient(650px circle at ${lightX}% ${lightY}%, #fcc997b0, #907aff80 40%, transparent 75%)`;

  return <div ref={ref} className={styles.stageScene}
    onPointerMove={(event) => {
      if (reduceMotion || event.pointerType !== "mouse" || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
      const y = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
      pointer.set((x - 0.5) * 4);
      lightX.set(x * 100);
      lightY.set(y * 100);
    }}
    onPointerLeave={() => { pointer.set(0); lightX.set(50); lightY.set(35); }}
    onFocusCapture={() => setSettled(true)} onPointerDownCapture={() => setSettled(true)}>
    <motion.div className={styles.stageHorizon} style={reduceMotion ? undefined : { x: horizonX }} aria-hidden="true" />
    <motion.div className={styles.stageLight} style={reduceMotion ? undefined : { background: reflection }} aria-hidden="true" />
    <motion.div className={styles.surfaceFrame} data-studio-surface style={{ transform: reduceMotion || settled ? "none" : transform }}>
      {children}
      <motion.div className={styles.surfaceRim} style={reduceMotion ? undefined : { background: rim }} aria-hidden="true" />
    </motion.div>
  </div>;
}

/** Opens with the viewport, without taking over scrolling or delaying focus. */
export function UnfoldSection({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [settled, setSettled] = useState(false);
  const reduceMotion = useStudioMotionPreference();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.95", "start 0.35"] });
  const progress = useSpring(scrollYProgress, spring);
  const scale = useTransform(progress, [0, 1], [0.92, 1]);
  const y = useTransform(progress, [0, 1], [32, 0]);
  const pitch = useTransform(progress, [0, 1], [7, 0]);
  const transform = useMotionTemplate`perspective(1600px) translateY(${y}px) rotateX(${pitch}deg) scale(${scale})`;
  return <div ref={ref} className={styles.unfold} onFocusCapture={() => setSettled(true)} onPointerDownCapture={() => setSettled(true)}>
    <motion.div style={{ transform: reduceMotion || settled ? "none" : transform, transformOrigin: "center top" }}>{children}</motion.div>
  </div>;
}

export function TurningBook({ children, className, reduceMotion }: { children: ReactNode; className: string; reduceMotion: boolean }) {
  const [angle, setAngle] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ id: number; x: number; angle: number } | null>(null);
  const turn = (value: number) => setAngle(Math.max(-35, Math.min(35, Math.round(value))));

  return <motion.div className={className} role="slider" tabIndex={0} aria-label="Turn the book"
    aria-valuemin={-35} aria-valuemax={35} aria-valuenow={angle} aria-valuetext={`${angle} degrees`} aria-orientation="horizontal"
    initial={{ opacity: 0 }} animate={{ opacity: 1, rotateY: angle - 14, rotateZ: -3 }} exit={{ opacity: 0 }}
    transition={reduceMotion || dragging ? { duration: 0 } : { type: "spring", stiffness: 170, damping: 26 }}
    onPointerDown={(event) => {
      if (!event.isPrimary || event.button !== 0) return;
      drag.current = { id: event.pointerId, x: event.clientX, angle };
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragging(true);
    }}
    onPointerMove={(event) => {
      if (drag.current?.id === event.pointerId) turn(drag.current.angle + (event.clientX - drag.current.x) * 0.35);
    }}
    onPointerUp={(event) => {
      if (drag.current?.id !== event.pointerId) return;
      drag.current = null;
      setDragging(false);
      event.currentTarget.releasePointerCapture(event.pointerId);
    }}
    onPointerCancel={() => { drag.current = null; setDragging(false); }}
    onLostPointerCapture={() => { drag.current = null; setDragging(false); }}
    onKeyDown={(event) => {
      const next = event.key === "ArrowRight" ? angle + 5 : event.key === "ArrowLeft" ? angle - 5 : event.key === "Home" ? -35 : event.key === "End" ? 35 : null;
      if (next !== null) { event.preventDefault(); turn(next); }
    }}>
    {children}
  </motion.div>;
}

const thought = ["Your", "imagination", "doesn’t", "stand", "still.", "Neither", "should", "your", "tools."];

export function AuthorScrollStatement() {
  const ref = useRef<HTMLParagraphElement>(null);
  const reduceMotion = useStudioMotionPreference();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.85", "end 0.55"] });
  return <p ref={ref} className={styles.scrollStatement} aria-label={thought.join(" ")}>
    {thought.map((word, index) => <StatementWord key={index} progress={scrollYProgress} index={index} reduceMotion={!!reduceMotion}>{word}</StatementWord>)}
  </p>;
}

function StatementWord({ children, progress, index, reduceMotion }: { children: string; progress: ReturnType<typeof useScroll>["scrollYProgress"]; index: number; reduceMotion: boolean }) {
  const opacity = useTransform(progress, [index / thought.length, (index + 1) / thought.length], [0.22, 1]);
  return <motion.span aria-hidden="true" style={{ opacity: reduceMotion ? 1 : opacity }}>{children}{" "}</motion.span>;
}
