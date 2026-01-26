"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export default function StatsSection() {
  const stats = useMemo(
    () => [
      {
        value: 300000,
        label: "Published books",
        format: "K+",
      },
      {
        value: 10,
        label: "Marketing platforms",
        format: "",
      },
      {
        value: 2000000,
        label: "Active readers",
        format: "M+",
      },
    ],
    []
  );

  const [animatedValues, setAnimatedValues] = useState(
    stats.map(() => 0)
  );
  const sectionRef = useRef(null);
  const hasAnimated = useRef(false);
  const rafRef = useRef(0);

  useEffect(() => {
    const node = sectionRef.current;
    if (!node) return;

    const animate = () => {
      const duration = 1400;
      const start = performance.now();

      const tick = (now) => {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);

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
    return value.toString();
  };

  return (
    <section
      ref={sectionRef}
      className="relative mx-auto flex w-full max-w-[1400px] flex-col items-center gap-24 px-6 py-24 lg:gap-[200px] lg:px-[115px] lg:py-[200px]"
    >
      <h2 className="max-w-[1028px] text-center text-3xl font-normal leading-[120%] text-[#F7F7F7] md:text-4xl lg:text-[55px]">
        Grow faster with social, blog, video, and newsletter content that converts.
      </h2>

      <div className="relative w-full">
        <div className="flex w-full flex-col items-center justify-between gap-12 md:flex-row md:gap-8 lg:w-[1116px] lg:mx-auto">
          {stats.map((stat, index) => (
            <div
              key={index}
              className="flex flex-col items-center gap-6 lg:gap-[25px]"
            >
              <div className="text-center text-6xl font-medium leading-[120%] text-[#F7F7F7] md:text-7xl lg:text-[96px]">
                {formatValue(animatedValues[index] ?? 0, stat.format)}
              </div>
              <div className="w-full max-w-[297px] text-center text-lg font-normal uppercase leading-[140%] text-[#F7F7F7] md:text-xl lg:text-[23px]">
                {stat.label}
              </div>
            </div>
          ))}
        </div>

        {/* Decorative circle */}
        <div className="pointer-events-none absolute -bottom-24 right-0 hidden h-[375px] w-[375px] overflow-hidden rounded-full bg-transparent shadow-[inset_-11px_-18px_75px_0_rgba(0,0,0,0.15)] lg:block"></div>
      </div>
    </section>
  );
}
