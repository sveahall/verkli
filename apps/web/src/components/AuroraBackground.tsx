"use client";

import { useEffect, useRef, useState } from "react";

export default function AuroraBackground() {
  const containerRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef({ x: 0.5, y: 0.5 });
  const rafId = useRef<number>(0);
  // Initialise from media query to avoid a synchronous setState inside
  // useEffect (which triggers cascading-render warnings in React).
  const [reduceMotion, setReduceMotion] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = () => setReduceMotion(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || reduceMotion) return;

    const flushPointer = () => {
      rafId.current = 0;
      container.style.setProperty("--mouse-x", pointerRef.current.x.toFixed(4));
      container.style.setProperty("--mouse-y", pointerRef.current.y.toFixed(4));
    };

    const handlePointerMove = (event: PointerEvent) => {
      pointerRef.current = {
        x: event.clientX / window.innerWidth,
        y: event.clientY / window.innerHeight,
      };
      if (rafId.current) return;
      rafId.current = requestAnimationFrame(flushPointer);
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    return () => {
      if (rafId.current) cancelAnimationFrame(rafId.current);
      window.removeEventListener("pointermove", handlePointerMove);
    };
  }, [reduceMotion]);

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
          filter: blur(64px);
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
            width: "78vmax",
            height: "78vmax",
            background: "radial-gradient(circle, rgba(123, 92, 255, 0.35) 0%, transparent 70%)",
          }}
        />
        <div
          className={`aurora-blob ${reduceMotion ? "" : "aurora-blob-animated aurora-blob-2"}`}
          style={{
            left: "50%",
            top: "60%",
            width: "74vmax",
            height: "74vmax",
            background: "radial-gradient(circle, rgba(80, 120, 255, 0.28) 0%, transparent 70%)",
          }}
        />
        <div
          className={`aurora-blob ${reduceMotion ? "" : "aurora-blob-animated aurora-blob-3"}`}
          style={{
            left: "70%",
            top: "15%",
            width: "66vmax",
            height: "66vmax",
            background: "radial-gradient(circle, rgba(255, 190, 120, 0.18) 0%, transparent 70%)",
          }}
        />
        <div
          className={`aurora-blob ${reduceMotion ? "" : "aurora-blob-animated aurora-blob-4"}`}
          style={{
            left: "20%",
            top: "55%",
            width: "62vmax",
            height: "62vmax",
            background: "radial-gradient(circle, rgba(255, 120, 180, 0.16) 0%, transparent 70%)",
          }}
        />

        {/* Mouse spotlight */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(
              600px 400px at calc(var(--mouse-x) * 100%) calc(var(--mouse-y) * 100%),
              rgba(255, 255, 255, 0.08) 0%,
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
