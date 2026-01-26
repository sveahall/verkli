"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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
      <div className="relative overflow-hidden rounded-[40px] bg-gradient-to-br from-white/[0.05] via-white/[0.03] to-transparent p-12 md:p-16">
        {/* Background glows */}
        <div className="pointer-events-none absolute -left-20 top-1/2 h-[300px] w-[300px] -translate-y-1/2 rounded-full bg-[#907AFF]/15 blur-[100px]" />
        <div className="pointer-events-none absolute -right-20 top-1/2 h-[300px] w-[300px] -translate-y-1/2 rounded-full bg-[#FCC997]/10 blur-[100px]" />
        
        <div className="relative text-center">
          <h2 className="text-[32px] font-semibold leading-[1.15] tracking-[-0.02em] text-white md:text-[40px]">
            The numbers speak for themselves
          </h2>
          <p className="mx-auto mt-4 max-w-[400px] text-[16px] text-white/50">
            Join thousands of authors already growing with Verkli.
          </p>
        </div>

        <div className="relative mt-14 grid gap-8 md:grid-cols-3">
          {stats.map((stat, index) => (
            <div 
              key={index} 
              className="group relative text-center"
            >
              <div 
                className="text-[56px] font-bold tracking-tight transition-all duration-300 md:text-[72px]"
                style={{ color: stat.color }}
              >
                {formatValue(animatedValues[index] ?? 0, stat.format)}
              </div>
              <div className="mt-2 text-[15px] text-white/50">
                {stat.label}
              </div>
              
              {/* Animated underline */}
              <div className="mx-auto mt-4 h-1 w-12 rounded-full transition-all duration-500 group-hover:w-20" style={{ background: `linear-gradient(90deg, transparent, ${stat.color}, transparent)` }} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
