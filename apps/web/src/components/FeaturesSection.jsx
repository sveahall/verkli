"use client";

import { useEffect, useRef, useState } from "react";
import BrandGradientText from "@/components/ui/brand-gradient-text";

const features = [
  {
    label: "Rights & ownership",
    title: "Your book stays yours.",
    description:
      "Keep full rights, pricing and distribution. We never reuse your content or train on your manuscript. You decide what ships, where, and when.",
    value: "100% ownership",
    image:
      "https://images.unsplash.com/photo-1507842217343-583bb7270b66?auto=format&fit=crop&w=1400&q=80",
    color: "#907AFF",
  },
  {
    label: "Reach",
    title: "Publish once, reach everywhere.",
    description:
      "Turn a single manuscript into posts, newsletters, ads, and reader magnets across channels and languages without compromising your voice.",
    value: "Multi-format output",
    image:
      "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1400&q=80",
    color: "#E29ED5",
  },
  {
    label: "Automation",
    title: "Marketing, on autopilot.",
    description:
      "Quotes, hooks, summaries, and themes are generated and scheduled for you. Stay consistent without the daily grind.",
    value: "Always-on engine",
    image:
      "https://images.unsplash.com/photo-1553877522-43269d4ea984?auto-format&fit=crop&w=1400&q=80",
    color: "#FCC997",
  },
  {
    label: "Distribution",
    title: "One hub, many platforms.",
    description:
      "Stop juggling tools. We handle the technical plumbing so you can focus on writing, publishing, and your readers.",
    value: "Fewer logins",
    image:
      "https://images.unsplash.com/photo-1485217988980-11786ced9454?auto=format&fit=crop&w=1400&q=80",
    color: "#FEE9A3",
  },
];

export default function FeaturesSection() {
  const [activeIndex, setActiveIndex] = useState(0);
  const itemsRef = useRef(new Map());
  const registerItem = (index) => (node) => {
    if (node) {
      itemsRef.current.set(index, node);
    } else {
      itemsRef.current.delete(index);
    }
  };

  useEffect(() => {
    const items = Array.from(itemsRef.current.values());
    if (!items.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const index = Number(entry.target.getAttribute("data-index"));
          if (!Number.isNaN(index)) setActiveIndex(index);
        });
      },
      { rootMargin: "-25% 0px -55% 0px", threshold: 0.2 }
    );

    items.forEach((item) => observer.observe(item));

    return () => observer.disconnect();
  }, []);

  return (
    <section className="mx-auto w-full max-w-[1080px] px-6 py-28">
      <div className="mb-14 text-center">
        <p className="text-[13px] font-medium uppercase tracking-[0.15em] text-[#907AFF]">
          Built for authors
        </p>
        <h2 className="mt-4 text-[clamp(28px,4vw,48px)] font-semibold leading-[1.1] tracking-[-0.025em] text-slate-900 dark:text-white">
          Here&apos;s what you get with{" "}
          <BrandGradientText>
            verkli.
          </BrandGradientText>
        </h2>
        <p className="mx-auto mt-4 max-w-[520px] text-[16px] leading-[1.7] text-slate-500 dark:text-white/45">
          A single workflow that protects your IP, grows your audience, and keeps
          your marketing consistent without the busywork.
        </p>
      </div>

      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:gap-16">
        <div className="flex flex-col gap-4">
          {features.map((feature, index) => {
            const isActive = index === activeIndex;
            return (
              <article
                key={feature.title}
                ref={registerItem(index)}
                data-index={index}
                tabIndex={0}
                onMouseEnter={() => setActiveIndex(index)}
                onFocus={() => setActiveIndex(index)}
                onClick={() => setActiveIndex(index)}
                aria-current={isActive ? "true" : "false"}
                className={`group relative cursor-pointer rounded-2xl border p-6 transition-all duration-400 ease-out md:p-7 ${
                  isActive
                    ? "border-black/[0.08] bg-white shadow-[0_4px_24px_rgba(0,0,0,0.04)] dark:border-white/[0.1] dark:bg-white/[0.04]"
                    : "border-black/[0.04] bg-white hover:border-black/[0.08] hover:shadow-[0_4px_24px_rgba(0,0,0,0.04)] dark:border-white/[0.06] dark:bg-white/[0.02] dark:hover:border-white/[0.1]"
                }`}
              >
                {/* Active indicator line */}
                <div
                  className={`absolute left-0 top-4 bottom-4 w-[3px] rounded-full transition-all duration-400 ${
                    isActive ? "opacity-100" : "opacity-0"
                  }`}
                  style={{ background: feature.color }}
                />

                <div className="relative">
                  <div className="flex flex-wrap items-center gap-3">
                    <span
                      className={`rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] transition-all duration-300 ${
                        isActive
                          ? "border-[#907AFF]/25 bg-[#907AFF]/[0.06] text-[#907AFF]"
                          : "border-black/[0.06] text-slate-400 dark:border-white/[0.08] dark:text-white/40"
                      }`}
                    >
                      {feature.label}
                    </span>
                    <span
                      className={`text-[11px] font-medium uppercase tracking-[0.12em] transition-colors duration-300 ${
                        isActive
                          ? "text-slate-500 dark:text-white/50"
                          : "text-slate-300 dark:text-white/25"
                      }`}
                    >
                      {feature.value}
                    </span>
                  </div>

                  <h3
                    className={`mt-4 text-[18px] font-semibold leading-[1.3] transition-colors duration-300 md:text-[20px] ${
                      isActive
                        ? "text-slate-900 dark:text-white"
                        : "text-slate-500 dark:text-white/60"
                    }`}
                  >
                    {feature.title}
                  </h3>

                  <div
                    className={`overflow-hidden transition-all duration-500 ease-out ${
                      isActive
                        ? "mt-3 max-h-[200px] opacity-100"
                        : "mt-0 max-h-0 opacity-0"
                    }`}
                  >
                    <p className="text-[15px] leading-[1.7] text-slate-500 dark:text-white/45">
                      {feature.description}
                    </p>
                  </div>
                </div>

                {/* Mobile image */}
                <div
                  className={`overflow-hidden rounded-xl border border-black/[0.04] transition-all duration-500 dark:border-white/[0.06] lg:hidden ${
                    isActive
                      ? "mt-5 max-h-[300px] opacity-100"
                      : "mt-0 max-h-0 opacity-0"
                  }`}
                >
                  <div
                    className="aspect-[4/3] w-full bg-cover bg-center"
                    style={{ backgroundImage: `url(${feature.image})` }}
                    aria-hidden="true"
                  />
                </div>
              </article>
            );
          })}
        </div>

        <div className="relative hidden lg:block">
          <div className="sticky top-24">
            <div className="feature-visual h-[520px] w-full">
              {features.map((feature, index) => (
                <div
                  key={feature.image}
                  className={`feature-visual-image ${
                    index === activeIndex ? "is-active" : ""
                  }`}
                  style={{ backgroundImage: `url(${feature.image})` }}
                  aria-hidden="true"
                />
              ))}
              <div className="feature-visual-frame" />

              {/* Image counter/indicator */}
              <div className="absolute bottom-6 left-6 z-10 flex items-center gap-2">
                {features.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setActiveIndex(index)}
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      index === activeIndex
                        ? "w-8 bg-slate-900 dark:bg-white"
                        : "w-1.5 bg-slate-300 hover:bg-slate-400 dark:bg-white/30 dark:hover:bg-white/50"
                    }`}
                    aria-label={`View feature ${index + 1}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
