"use client";

import { useEffect, useRef, useState } from "react";

const features = [
  {
    label: "Rights & ownership",
    title: "Your book stays yours.",
    description:
      "Keep full rights, pricing and distribution. We never reuse your content or train on your manuscript. You decide what ships, where, and when.",
    value: "100% ownership",
    image:
      "https://images.unsplash.com/photo-1507842217343-583bb7270b66?auto=format&fit=crop&w=1400&q=80",
    gradient: "from-purple-500/20 to-transparent",
  },
  {
    label: "Reach",
    title: "Publish once, reach everywhere.",
    description:
      "Turn a single manuscript into posts, newsletters, ads, and reader magnets across channels and languages without compromising your voice.",
    value: "Multi-format output",
    image:
      "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1400&q=80",
    gradient: "from-blue-500/20 to-transparent",
  },
  {
    label: "Automation",
    title: "Marketing, on autopilot.",
    description:
      "Quotes, hooks, summaries, and themes are generated and scheduled for you. Stay consistent without the daily grind.",
    value: "Always-on engine",
    image:
      "https://images.unsplash.com/photo-1553877522-43269d4ea984?auto-format&fit=crop&w=1400&q=80",
    gradient: "from-amber-500/20 to-transparent",
  },
  {
    label: "Distribution",
    title: "One hub, many platforms.",
    description:
      "Stop juggling tools. We handle the technical plumbing so you can focus on writing, publishing, and your readers.",
    value: "Fewer logins",
    image:
      "https://images.unsplash.com/photo-1485217988980-11786ced9454?auto=format&fit=crop&w=1400&q=80",
    gradient: "from-emerald-500/20 to-transparent",
  },
];

export default function FeaturesSection() {
  const [activeIndex, setActiveIndex] = useState(0);
  const itemsRef = useRef([]);

  itemsRef.current = [];
  const registerItem = (node) => {
    if (node) itemsRef.current.push(node);
  };

  useEffect(() => {
    const items = itemsRef.current;
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
    <section className="mx-auto w-full max-w-[1400px] px-6 py-14 lg:px-[115px]">
      <div className="mb-10 flex flex-col gap-4 lg:mb-16">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-white/45">
          Built for authors
        </p>
        <h2 className="text-3xl font-semibold leading-[120%] text-[#F7F7F7] md:text-4xl lg:text-[42px]">
          Here's what you get with verkli.
        </h2>
        <p className="max-w-2xl text-base text-white/60 md:text-lg">
          A single workflow that protects your IP, grows your audience, and keeps
          your marketing consistent without the busywork.
        </p>
      </div>

      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:gap-16">
        <div className="flex flex-col gap-5">
          {features.map((feature, index) => {
            const isActive = index === activeIndex;
            return (
              <article
                key={feature.title}
                ref={registerItem}
                data-index={index}
                tabIndex={0}
                onMouseEnter={() => setActiveIndex(index)}
                onFocus={() => setActiveIndex(index)}
                onClick={() => setActiveIndex(index)}
                aria-current={isActive ? "true" : "false"}
                className={`feature-card group relative cursor-pointer overflow-hidden rounded-[24px] border px-6 py-6 transition-all duration-500 ease-out md:px-8 md:py-7 ${
                  isActive
                    ? "border-white/20 bg-white/[0.08] shadow-[0_20px_50px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.1)] scale-[1.02]"
                    : "border-white/8 bg-white/[0.02] hover:border-white/12 hover:bg-white/[0.04]"
                }`}
              >
                {/* Active indicator line */}
                <div 
                  className={`absolute left-0 top-0 h-full w-1 rounded-l-[24px] bg-gradient-to-b from-purple-400 to-purple-600 transition-all duration-500 ${
                    isActive ? "opacity-100" : "opacity-0"
                  }`}
                />
                
                {/* Subtle glow effect */}
                <div 
                  className={`pointer-events-none absolute -inset-px rounded-[24px] bg-gradient-to-br ${feature.gradient} opacity-0 transition-opacity duration-500 ${
                    isActive ? "opacity-100" : "group-hover:opacity-50"
                  }`}
                />

                <div className="relative z-10">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] transition-all duration-300 ${
                      isActive 
                        ? "border-purple-400/40 bg-purple-500/10 text-purple-300" 
                        : "border-white/12 text-white/50"
                    }`}>
                      {feature.label}
                    </span>
                    <span className={`text-[11px] font-medium uppercase tracking-[0.15em] transition-colors duration-300 ${
                      isActive ? "text-white/60" : "text-white/35"
                    }`}>
                      {feature.value}
                    </span>
                  </div>

                  <h3
                    className={`mt-4 text-xl font-semibold leading-[130%] transition-all duration-300 md:text-2xl ${
                      isActive ? "text-white translate-x-0" : "text-white/75"
                    }`}
                  >
                    {feature.title}
                  </h3>
                  
                  <div className={`overflow-hidden transition-all duration-500 ease-out ${
                    isActive ? "max-h-[200px] opacity-100 mt-3" : "max-h-0 opacity-0 mt-0"
                  }`}>
                    <p className="text-[15px] leading-[165%] text-white/60">
                      {feature.description}
                    </p>
                  </div>
                </div>

                {/* Mobile image */}
                <div className={`overflow-hidden rounded-[18px] border border-white/10 bg-white/5 transition-all duration-500 lg:hidden ${
                  isActive ? "mt-5 max-h-[300px] opacity-100" : "mt-0 max-h-0 opacity-0"
                }`}>
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
                        ? "w-8 bg-white" 
                        : "w-1.5 bg-white/40 hover:bg-white/60"
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
