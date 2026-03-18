"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import BrandGradientText from "@/components/ui/brand-gradient-text";
import Reveal from "@/components/Reveal";

export default function StatsSection() {
  const stats = useMemo(
    () => [
      {
        value: 300000,
        label: "Books published",
        format: "K+",
        color: "#907AFF",
      },
      {
        value: 10,
        label: "Platforms connected",
        format: "+",
        color: "#E29ED5",
      },
      {
        value: 2000000,
        label: "Readers reached",
        format: "M+",
        color: "#FCC997",
      },
    ],
    []
  );

  const [animatedValues, setAnimatedValues] = useState(stats.map(() => 0));
  const sectionRef = useRef(null);
  const hasAnimated = useRef(false);
  const rafRef = useRef(0);

  useEffect(() => {
    const node = sectionRef.current;
    if (!node) return;

    const animate = () => {
      const duration = 1600;
      const start = performance.now();

      const tick = (now) => {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 4);

        setAnimatedValues(
          stats.map((stat) => Math.round(stat.value * eased))
        );

        if (progress < 1) {
          rafRef.current = requestAnimationFrame(tick);
        }
      };

      rafRef.current = requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true;
          animate();
          observer.disconnect();
        }
      },
      { threshold: 0.35 }
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [stats]);

  const formatDecimal = (num) => {
    const fixed = num.toFixed(1);
    return fixed.endsWith(".0") ? fixed.slice(0, -2) : fixed;
  };

  const formatValue = (value, format) => {
    if (format === "K+") {
      const num = value / 1000;
      const display = num < 10 ? formatDecimal(num) : Math.round(num).toString();
      return `${display}K+`;
    }
    if (format === "M+") {
      const num = value / 1000000;
      const display = num < 10 ? formatDecimal(num) : Math.round(num).toString();
      return `${display}M+`;
    }
    if (format === "+") {
      return `${value}+`;
    }
    return value.toString();
  };

  return (
    <section
      ref={sectionRef}
      className="relative mx-auto w-full max-w-[1200px] px-6 py-24"
    >
      <Reveal>
      <div className="text-center">
        <p className="text-[13px] font-medium uppercase tracking-[0.15em] text-[#907AFF]">
          By the numbers
        </p>
        <h2 className="mt-4 text-[clamp(28px,4vw,48px)] font-semibold leading-[1.1] tracking-[-0.025em] text-slate-900 dark:text-white">
          The numbers speak{" "}
          <BrandGradientText>
            for themselves
          </BrandGradientText>
        </h2>
        <p className="mx-auto mt-4 max-w-[420px] text-[16px] leading-[1.7] text-slate-500 dark:text-white/45">
          Join thousands of authors already growing with Verkli.
        </p>
      </div>

      {/* Gradient wrapper with glow blobs */}
      <div className="relative mt-16 overflow-hidden rounded-[32px] border border-black/[0.06] bg-gradient-to-br from-black/[0.03] via-transparent to-black/[0.02] p-1 dark:border-white/[0.08] dark:from-white/[0.04] dark:to-white/[0.02]">
        {/* Glow blobs */}
        <div className="pointer-events-none absolute -left-24 -top-24 h-64 w-64 rounded-full bg-[#907AFF]/10 blur-3xl" />
        <div className="pointer-events-none absolute -right-24 top-0 h-64 w-64 rounded-full bg-[#E29ED5]/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-[#FCC997]/10 blur-3xl" />

        <div className="grid gap-px overflow-hidden rounded-[28px] bg-black/[0.04] md:grid-cols-3 dark:bg-white/[0.06]">
          {stats.map((stat, index) => (
            <div
              key={index}
              className="group relative bg-white/80 p-10 text-center backdrop-blur-sm transition-colors duration-300 hover:bg-white dark:bg-white/[0.03] dark:hover:bg-white/[0.06]"
            >
              {/* Hover glow */}
              <div
                className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                style={{
                  background: `radial-gradient(300px circle at 50% 50%, ${stat.color}12, transparent 70%)`,
                }}
              />
              <div
                className="relative text-[56px] font-bold leading-none tracking-tight md:text-[64px]"
                style={{ color: stat.color }}
              >
                {formatValue(animatedValues[index] ?? 0, stat.format)}
              </div>
              <div className="relative mt-3 text-[15px] text-slate-500 dark:text-white/45">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>
      </Reveal>
    </section>
  );
}
