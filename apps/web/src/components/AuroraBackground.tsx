"use client";

import { useEffect, useRef, useState } from "react";

export default function AuroraBackground() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mouseTarget = useRef({ x: 0.5, y: 0.5 });
  const mouseCurrent = useRef({ x: 0.5, y: 0.5 });
  const rafId = useRef<number>(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceMotion(mq.matches);
    const handler = () => setReduceMotion(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseMove = (e: MouseEvent) => {
      mouseTarget.current = {
        x: e.clientX / window.innerWidth,
        y: e.clientY / window.innerHeight,
      };
    };

    const tick = () => {
      const lerp = 0.06;
      mouseCurrent.current.x += (mouseTarget.current.x - mouseCurrent.current.x) * lerp;
      mouseCurrent.current.y += (mouseTarget.current.y - mouseCurrent.current.y) * lerp;
      container.style.setProperty("--mouse-x", String(mouseCurrent.current.x));
      container.style.setProperty("--mouse-y", String(mouseCurrent.current.y));
      rafId.current = requestAnimationFrame(tick);
    };
    rafId.current = requestAnimationFrame(tick);

    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      cancelAnimationFrame(rafId.current);
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, []);

  return (
    <>
      <style>{`
        .aurora-bg {
          --mouse-x: 0.5;
          --mouse-y: 0.5;
        }
        .aurora-blob {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          will-change: transform;
        }
        .aurora-blob-animated {
          animation: aurora-float 16s ease-in-out infinite;
        }
        .aurora-blob-1 { animation-delay: 0s; }
        .aurora-blob-2 { animation-delay: -4s; }
        .aurora-blob-3 { animation-delay: -8s; }
        .aurora-blob-4 { animation-delay: -12s; }
        @keyframes aurora-float {
          0%, 100% { transform: translate(0, 0) scale(1); }
          25% { transform: translate(6%, 4%) scale(1.08); }
          50% { transform: translate(-4%, 6%) scale(0.95); }
          75% { transform: translate(5%, -3%) scale(1.05); }
        }
      `}</style>
      <div
        ref={containerRef}
        className="aurora-bg fixed inset-0 -z-10 overflow-hidden pointer-events-none"
        style={{ backgroundColor: "#070914" }}
        aria-hidden
      >
        {/* Aurora blobs */}
        <div
          className={`aurora-blob ${reduceMotion ? "" : "aurora-blob-animated aurora-blob-1"}`}
          style={{
            left: "10%",
            top: "20%",
            width: "90vmax",
            height: "90vmax",
            background: "radial-gradient(circle, #907AFF 5%, transparent 70%)",
          }}
        />
        <div
          className={`aurora-blob ${reduceMotion ? "" : "aurora-blob-animated aurora-blob-2"}`}
          style={{
            left: "50%",
            top: "60%",
            width: "85vmax",
            height: "85vmax",
            background: "radial-gradient(circle, #E29ED5 15%, transparent 70%)",
          }}
        />
        <div
          className={`aurora-blob ${reduceMotion ? "" : "aurora-blob-animated aurora-blob-3"}`}
          style={{
            left: "70%",
            top: "15%",
            width: "75vmax",
            height: "75vmax",
            background: "radial-gradient(circle, #FCC997 15%, transparent 70%)",
          }}
        />
        <div
          className={`aurora-blob ${reduceMotion ? "" : "aurora-blob-animated aurora-blob-4"}`}
          style={{
            left: "20%",
            top: "55%",
            width: "70vmax",
            height: "70vmax",
            background: "radial-gradient(circle, #FEE9A3 15%, transparent 70%)",
          }}
        />

        {/* Mouse spotlight */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(
              600px 400px at calc(var(--mouse-x) * 100%) calc(var(--mouse-y) * 100%),
              #E29ED5 10%,
              transparent 50%
            )`,
          }}
        />

        {/* Grain overlay */}
        <div
          className="absolute inset-0 opacity-[0.04] pointer-events-none"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          }}
        />

        {/* Vignette */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 80% 80% at 50% 50%, transparent 30%, rgba(0, 0, 0, 0.5) 100%)",
          }}
        />
      </div>
    </>
  );
}
