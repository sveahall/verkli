"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import GlassSurface from "@/components/GlassSurface";
import GridMotion from "@/components/GridMotion";
import TestimonialSection from "@/components/TestimonialSection";
import StatsSection from "@/components/StatsSection";
import FeaturesSection from "@/components/FeaturesSection";

const gridImages = [
  "https://images.unsplash.com/photo-1723403804231-f4e9b515fe9d?q=80&w=3870&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  "https://images.unsplash.com/photo-1748370987492-eb390a61dcda?q=80&w=3464&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
];

const gridRows = 6;
const gridCols = 10;
const gridItems = Array.from({ length: gridRows * gridCols }, (_, index) => {
  return gridImages[index % gridImages.length];
});

const glassBaseProps = {
  displace: 0.5,
  distortionScale: -180,
  redOffset: 0,
  greenOffset: 10,
  blueOffset: 20,
  brightness: 50,
  opacity: 0.93,
  backgroundOpacity: 0.12,
  blur: 12,
  saturation: 1.2,
  mixBlendMode: "screen",
};

function InteractiveTestimonialSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState({ x: 0.5, y: 0.5 });
  const [isHovering, setIsHovering] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setMousePos({ x, y });
  };

  const handleMouseEnter = () => setIsHovering(true);
  const handleMouseLeave = () => {
    setMousePos({ x: 0.5, y: 0.5 });
    setIsHovering(false);
  };

  return (
    <section className="relative mx-auto w-full max-w-[1200px] px-6 py-20">
      {/* Background gradient accent */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-[500px] w-[700px] rounded-full bg-gradient-to-r from-[#907AFF]/5 via-[#E29ED5]/3 to-transparent blur-[120px]" />
      </div>

      <div
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="relative overflow-hidden rounded-[40px] border border-white/[0.08] bg-gradient-to-br from-white/[0.04] via-white/[0.02] to-transparent p-10 md:p-14"
      >
        {/* Interactive glows - brand colors */}
        <div
          className="pointer-events-none absolute h-[500px] w-[500px] rounded-full blur-[150px] transition-all duration-700 ease-out"
          style={{
            background: "#907AFF",
            opacity: isHovering ? 0.15 : 0.08,
            left: `${mousePos.x * 100 - 25}%`,
            top: `${mousePos.y * 100 - 25}%`,
          }}
        />
        <div
          className="pointer-events-none absolute h-[400px] w-[400px] rounded-full blur-[120px] transition-all duration-1000 ease-out"
          style={{
            background: "#E29ED5",
            opacity: isHovering ? 0.12 : 0.06,
            left: `${(1 - mousePos.x) * 100 - 20}%`,
            top: `${(1 - mousePos.y) * 100 - 20}%`,
          }}
        />
        <div
          className="pointer-events-none absolute h-[300px] w-[300px] rounded-full blur-[100px] transition-all duration-500 ease-out"
          style={{
            background: "#FCC997",
            opacity: isHovering ? 0.1 : 0.04,
            left: `${mousePos.x * 80 + 10}%`,
            top: `${mousePos.y * 60 + 20}%`,
          }}
        />

        <div className="relative grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-14">
          {/* Left */}
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#907AFF]/20 bg-[#907AFF]/5 px-3 py-1 mb-6">
              <div className="h-1.5 w-1.5 rounded-full bg-[#907AFF]" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#907AFF]">Social proof</span>
            </div>
            <h2 className="text-[40px] font-semibold leading-[1.05] tracking-[-0.02em] text-white md:text-[52px]">
              Authors love
              <br />
              <span className="bg-gradient-to-r from-white/40 to-white/20 bg-clip-text text-transparent">what we do.</span>
            </h2>
            <p className="mt-6 max-w-[380px] text-[16px] leading-[1.7] text-white/50">
              Join thousands of writers who use Verkli to turn their stories into content that reaches readers everywhere.
            </p>
            <div className="mt-8 flex items-center gap-4">
              <GlassSurface
                {...glassBaseProps}
                width="auto"
                height="auto"
                borderRadius={999}
                className="glass-button border border-[#907AFF]/30 transition-all hover:scale-[1.02] hover:border-[#907AFF]/50"
              >
                <span className="px-7 py-3 text-[14px] font-medium text-white">Start for free</span>
              </GlassSurface>
              <a href="#" className="text-[14px] text-white/50 underline underline-offset-4 transition-colors hover:text-white/70">
                Read case studies
              </a>
            </div>
          </div>

          {/* Right: Clean testimonial stack */}
          <div className="space-y-4">
            {/* Main quote */}
            <div className="rounded-3xl bg-white/[0.04] p-8 backdrop-blur-sm">
              <p className="text-[20px] font-normal leading-[1.5] tracking-[-0.01em] text-white/90">
                "Fable helped me turn one story into content that reached millions. The success has been incredible."
              </p>
              <div className="mt-6 flex items-center gap-4">
                <img
                  src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&h=80&fit=crop&crop=face"
                  alt="Ariana Godoy"
                  className="h-11 w-11 rounded-full object-cover"
                />
                <div>
                  <div className="text-[15px] font-medium text-white">Ariana Godoy</div>
                  <div className="text-[13px] text-white/50">Bestselling author</div>
                </div>
              </div>
            </div>

            {/* Two smaller quotes */}
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-2xl bg-white/[0.04] p-5 backdrop-blur-sm">
                <p className="text-[14px] leading-relaxed text-white/80">
                  "My launch stayed visible for weeks."
                </p>
                <div className="mt-4 flex items-center gap-3">
                  <img
                    src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=60&h=60&fit=crop&crop=face"
                    alt="Sarah Chen"
                    className="h-8 w-8 rounded-full object-cover"
                  />
                  <div className="text-[13px] text-white/50">Sarah Chen</div>
                </div>
              </div>
              <div className="rounded-2xl bg-white/[0.04] p-5 backdrop-blur-sm">
                <p className="text-[14px] leading-relaxed text-white/80">
                  "BookTok finally clicked for me."
                </p>
                <div className="mt-4 flex items-center gap-3">
                  <img
                    src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=60&h=60&fit=crop&crop=face"
                    alt="Mark Torres"
                    className="h-8 w-8 rounded-full object-cover"
                  />
                  <div className="text-[13px] text-white/50">Mark Torres</div>
                </div>
              </div>
            </div>

            {/* Minimal stats */}
            <div className="flex items-center justify-between rounded-2xl bg-white/[0.04] px-6 py-5 backdrop-blur-sm">
              <div className="text-center">
                <div className="text-xl font-semibold tracking-tight text-white">12,000+</div>
                <div className="mt-0.5 text-[11px] text-white/40">authors</div>
              </div>
              <div className="h-8 w-px bg-white/10" />
              <div className="text-center">
                <div className="text-xl font-semibold tracking-tight text-white">4.9/5</div>
                <div className="mt-0.5 text-[11px] text-white/40">rating</div>
              </div>
              <div className="h-8 w-px bg-white/10" />
              <div className="text-center">
                <div className="text-xl font-semibold tracking-tight text-white">89%</div>
                <div className="mt-0.5 text-[11px] text-white/40">time saved</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  const [heroMousePos, setHeroMousePos] = useState({ x: 0.5, y: 0.5 });
  const heroRef = useRef<HTMLElement>(null);

  const handleHeroMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    if (!heroRef.current) return;
    const rect = heroRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setHeroMousePos({ x, y });
  };

  return (
    <main className="relative min-h-screen bg-[#050508] text-white">
      <header className="sticky top-6 z-20 mx-auto w-full max-w-[1660px] px-6">
        <GlassSurface
          {...glassBaseProps}
          width="100%"
          height="75px"
          borderRadius={300}
          className="w-full border border-white/10 px-6 py-4 md:px-10 [&_.glass-surface__content]:w-full [&_.glass-surface__content]:justify-between [&_.glass-surface__content]:p-0"
        >
          <nav className="flex w-full items-center justify-between gap-6">
            {/* Logo and navigation */}
            <div className="flex items-center gap-10">
              <img
                src="/favicon.svg"
                alt="Verkli"
                className="h-8 w-auto"
                loading="eager"
              />

              <div className="hidden items-center gap-10 text-[17px] font-normal text-white lg:flex">
                {["Features", "Integrations", "Examples", "FAQ"].map((item) => (
                  <button key={item} className="nav-item flex items-center gap-2">
                    <span>{item}</span>
                    <svg
                      className="h-3 w-3"
                      viewBox="0 0 12 12"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M3 4.5L6 7.5L9 4.5" />
                    </svg>
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-4">
              <Link href="/writer/signin" className="sign-in-button px-6 text-[17px] font-regular text-white/100 transition hover:text-white/70">
                Sign in
              </Link>
              <Link href="/writer/signup">
                <GlassSurface
                  {...glassBaseProps}
                  width="auto"
                  height="auto"
                  borderRadius={999}
                  className="glass-surface--button border border-white/10 transition-transform hover:scale-[1.02]"
                >
                  <span className="sign-up-button px-7 py-0 text-[17px] font-medium text-[#F7F7F7]">
                    Sign up
                  </span>
                </GlassSurface>
              </Link>
              <div className="divider hidden h-8 w-px bg-white/20 md:block" />
              <div className="hidden md:block">
                <GlassSurface
                  {...glassBaseProps}
                  width="auto"
                  height="auto"
                  borderRadius={999}
                  className="glass-surface--button"
                >
                  <button
                    className="language-toggle flex items-center justify-center px-3.5 py-2.5"
                    aria-label="Change language"
                  >
                    <svg
                      width="48"
                      height="18"
                      viewBox="0 0 48 18"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      aria-hidden="true"
                    >
                      <path d="M11.5083 11.1435L7.74534 0.305126C7.7102 0.203899 7.56721 0.203408 7.53137 0.304391L3.6371 11.2769" stroke="#F7F7F7" strokeWidth="1.70079" strokeLinecap="round"/>
                      <path d="M5.07678 7.75988H10.1083" stroke="#F7F7F7" strokeWidth="1.70079"/>
                      <path d="M16.3801 8.53955L26.4786 8.53955" stroke="#F7F7F7" strokeWidth="1.70079" strokeLinecap="round"/>
                      <path d="M21.4293 5.89978L21.4293 8.53782" stroke="#F7F7F7" strokeWidth="1.70079" strokeLinecap="round"/>
                      <path d="M16.3801 17.7874C23.4667 14.9174 24.2817 10.5237 24.8841 8.61028" stroke="#F7F7F7" strokeWidth="1.70079" strokeLinecap="round"/>
                      <path d="M18.1516 11.7992C19.0847 13.4645 20.8445 15.9803 24.8485 17.8228" stroke="#F7F7F7" strokeWidth="1.70079" strokeLinecap="round"/>
                      <path d="M42.1928 11.352C42.3576 11.5177 42.6286 11.5177 42.7934 11.352L47.0454 7.07497C47.2101 6.90924 47.2101 6.63658 47.0454 6.47084C46.8806 6.30511 46.6095 6.30511 46.4448 6.47084L42.4931 10.4458L38.5414 6.47084C38.3767 6.30511 38.1056 6.30511 37.9408 6.47084C37.7761 6.63658 37.7761 6.90924 37.9408 7.07497L42.1928 11.352Z" fill="#F7F7F7"/>
                    </svg>
                  </button>
                </GlassSurface>
              </div>
            </div>
          </nav>
        </GlassSurface>
      </header>

      <div className="section-stack">
      {/* Hero */}
      <section 
        ref={heroRef}
        onMouseMove={handleHeroMouseMove}
        className="relative isolate mx-auto my-auto flex min-h-screen w-full max-w-[1800px] flex-col items-center justify-center overflow-hidden px-6 pb-50 text-center"
      >
        {/* Background Grid */}
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="relative h-full w-full">
            <div className="absolute inset-0 z-0">
              <GridMotion
                items={gridItems}
                gradientColor="black"
                rows={gridRows}
                cols={gridCols}
              />
            </div>
            <div className="absolute inset-0 z-10 bg-black/70" />
            {/* Gradient overlay */}
            <div className="absolute inset-0 z-11 bg-gradient-to-b from-[#050508] via-transparent to-[#050508]" />
            
            {/* Interactive mouse-following glows */}
            <div 
              className="absolute z-12 h-[600px] w-[600px] rounded-full blur-[180px] transition-all duration-1000 ease-out"
              style={{
                background: "#907AFF",
                opacity: 0.15,
                left: `${heroMousePos.x * 100 - 30}%`,
                top: `${heroMousePos.y * 100 - 30}%`,
              }}
            />
            <div 
              className="absolute z-12 h-[400px] w-[400px] rounded-full blur-[150px] transition-all duration-[1500ms] ease-out"
              style={{
                background: "#E29ED5",
                opacity: 0.1,
                left: `${(1 - heroMousePos.x) * 100 - 20}%`,
                top: `${heroMousePos.y * 100 - 20}%`,
              }}
            />
            <div 
              className="absolute z-12 h-[300px] w-[300px] rounded-full blur-[120px] transition-all duration-700 ease-out"
              style={{
                background: "#FCC997",
                opacity: 0.08,
                left: `${heroMousePos.x * 70 + 15}%`,
                top: `${(1 - heroMousePos.y) * 60 + 20}%`,
              }}
            />
          </div>
        </div>

        {/* Floating badge */}
        <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 backdrop-blur-sm transition-transform duration-300 hover:scale-105">
          <div className="h-2 w-2 animate-pulse rounded-full bg-[#907AFF]" />
          <span className="text-[13px] text-white/60">Now in public beta</span>
        </div>

        <h1 className="text-[52px] font-semibold leading-[1.05] tracking-[-0.03em] text-white md:text-[80px]">
          Write once.
          <br />
          <span className="bg-gradient-to-r from-white/50 via-white/30 to-white/50 bg-clip-text text-transparent">Show up everywhere.</span>
        </h1>
        <p className="mt-8 max-w-[520px] text-[17px] leading-relaxed text-white/50 md:text-[18px]">
          The platform for authors to turn books into content, connect with readers, and build sustainable revenue.
        </p>

        <div className="mt-10 flex items-center gap-4">
          <GlassSurface
            {...glassBaseProps}
            width="auto"
            height="auto"
            borderRadius={999}
            className="glass-button border border-[#907AFF]/30 transition-all hover:scale-[1.02] hover:border-[#907AFF]/50"
          >
            <span className="px-8 py-3.5 text-[15px] font-medium text-white">Get started free</span>
          </GlassSurface>
          <a href="#features" className="group flex items-center gap-2 text-[15px] text-white/50 transition-colors hover:text-white/70">
            See how it works
            <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </a>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2">
          <div className="flex h-10 w-6 items-start justify-center rounded-full border border-white/20 p-1.5 transition-colors duration-300 hover:border-white/40">
            <div className="h-2 w-1 animate-bounce rounded-full bg-white/40" style={{ animationDuration: "1.5s" }} />
          </div>
        </div>
      </section>

      {/* Bento Grid Section */}
      <section className="relative mx-auto w-full max-w-[1200px] px-6 py-16">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* Main feature card */}
          <div className="group relative col-span-full overflow-hidden rounded-[32px] bg-gradient-to-br from-[#907AFF]/20 via-[#E29ED5]/10 to-[#FCC997]/10 p-10 lg:col-span-2 lg:p-12">
            <div className="pointer-events-none absolute -right-20 -top-20 h-[400px] w-[400px] rounded-full bg-[#907AFF]/20 blur-[100px] transition-transform duration-1000 group-hover:translate-x-10" />
            <div className="pointer-events-none absolute -bottom-20 -left-20 h-[300px] w-[300px] rounded-full bg-[#E29ED5]/15 blur-[80px]" />
            
            <div className="relative max-w-[500px]">
              <h2 className="text-[36px] font-semibold leading-[1.1] tracking-[-0.02em] text-white md:text-[48px]">
                Zero friction
                <br />
                <span className="bg-gradient-to-r from-[#907AFF] via-[#E29ED5] to-[#FCC997] bg-clip-text text-transparent">book marketing.</span>
              </h2>
              <p className="mt-6 max-w-[420px] text-[17px] leading-[1.7] text-white/60">
                An end-to-end platform that turns your book into structured content — easy to publish, adapt, and scale.
              </p>
              <div className="mt-8">
                <GlassSurface
                  {...glassBaseProps}
                  width="auto"
                  height="auto"
                  borderRadius={999}
                  className="glass-button inline-flex border border-white/20 transition-all hover:scale-[1.02]"
                >
                  <span className="px-7 py-3 text-[15px] font-medium text-white">Start for free</span>
                </GlassSurface>
              </div>
            </div>
          </div>

          {/* Stats card */}
          <div className="group relative overflow-hidden rounded-[32px] bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-8">
            <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-[#FCC997]/20 blur-3xl opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
            <div className="relative flex h-full flex-col justify-between">
              <div>
                <div className="flex items-center gap-1 mb-2">
                  {[1,2,3,4,5].map((i) => (
                    <svg key={i} className="h-4 w-4 text-[#FCC997]" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <p className="text-[40px] font-semibold text-white">4.9/5</p>
                <p className="mt-1 text-[14px] text-white/50">Average rating from authors</p>
              </div>
              <div className="mt-6 flex -space-x-2">
                {["https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&h=80&fit=crop&crop=face",
                  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=80&fit=crop&crop=face",
                  "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=80&h=80&fit=crop&crop=face",
                  "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=80&h=80&fit=crop&crop=face"
                ].map((src, i) => (
                  <img key={i} src={src} alt="" className="h-9 w-9 rounded-full border-2 border-[#0a0a0f] object-cover transition-transform duration-300 hover:scale-110 hover:z-10" />
                ))}
                <div className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#0a0a0f] bg-white/10 text-[11px] font-medium text-white/70">+2k</div>
              </div>
            </div>
          </div>

          {/* Feature cards */}
          {[
            { title: "No credit card", desc: "Start free, upgrade anytime", color: "#907AFF" },
            { title: "2 min setup", desc: "Go live in minutes", color: "#E29ED5" },
            { title: "10+ platforms", desc: "Publish everywhere", color: "#FCC997" },
          ].map((item) => (
            <div key={item.title} className="group relative overflow-hidden rounded-[24px] bg-gradient-to-br from-white/[0.05] to-transparent p-6 transition-all duration-500 hover:from-white/[0.08]">
              <div 
                className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full blur-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-50"
                style={{ background: item.color }}
              />
              <div className="relative">
                <div className="mb-3 h-2 w-2 rounded-full" style={{ background: item.color }} />
                <p className="text-[17px] font-medium text-white">{item.title}</p>
                <p className="mt-1 text-[14px] text-white/50">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <TestimonialSection />

      <StatsSection />

      <FeaturesSection />

      <InteractiveTestimonialSection />

      <section className="mx-auto w-full max-w-[1200px] px-6 py-24">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr] lg:items-center">
          <div>
            <p className="text-[13px] font-medium uppercase tracking-wider text-[#E29ED5]">Why Verkli</p>
            <h2 className="mt-4 text-[36px] font-semibold leading-[1.1] tracking-[-0.02em] text-white md:text-[44px]">
              Everything you need to
              <br />
              <span className="bg-gradient-to-r from-[#907AFF] via-[#E29ED5] to-[#FCC997] bg-clip-text text-transparent">grow your audience.</span>
            </h2>
            <p className="mt-6 max-w-[400px] text-[16px] leading-[1.7] text-white/50">
              Simple tools that help you reach readers without the complexity.
            </p>
            <div className="mt-8">
              <GlassSurface
                {...glassBaseProps}
                width="auto"
                height="auto"
                borderRadius={999}
                className="glass-button inline-flex border border-white/15 transition-all hover:scale-[1.02]"
              >
                <span className="px-7 py-3 text-[15px] font-medium text-white">Explore features</span>
              </GlassSurface>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {[
              {
                title: "Get discovered",
                description: "Turn your book into scroll-stopping content for TikTok and beyond.",
                color: "#907AFF",
              },
              {
                title: "Grow your audience",
                description: "Reach readers before they buy. Build momentum with content.",
                color: "#E29ED5",
              },
              {
                title: "Automate marketing",
                description: "AI-generated hooks, scripts, and captions. Without daily effort.",
                color: "#FCC997",
              },
              {
                title: "Focus on writing",
                description: "Upload a chapter, get content. No complex tools needed.",
                color: "#FEE9A3",
              },
            ].map((item, index) => (
              <div
                key={item.title}
                className="group relative overflow-hidden rounded-[24px] border border-white/[0.06] bg-gradient-to-br from-white/[0.04] to-transparent p-6 transition-all duration-500 hover:border-white/[0.12] hover:from-white/[0.06]"
              >
                {/* Glow */}
                <div 
                  className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full blur-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-50"
                  style={{ background: item.color }}
                />
                
                <div className="relative">
                  <div 
                    className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl transition-transform duration-500 group-hover:scale-110"
                    style={{ background: `linear-gradient(135deg, ${item.color}25, ${item.color}10)` }}
                  >
                    <div className="h-2 w-2 rounded-full" style={{ background: item.color }} />
                  </div>
                  
                  <h3 className="text-[17px] font-semibold text-white">{item.title}</h3>
                  <p className="mt-2 text-[14px] leading-[1.6] text-white/50">
                    {item.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative mx-auto w-full max-w-[1200px] px-6 py-24">
        <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          {/* Left - Main CTA */}
          <div className="group relative overflow-hidden rounded-[40px] bg-gradient-to-br from-[#907AFF]/30 via-[#E29ED5]/20 to-[#FCC997]/15 p-10 md:p-14">
            {/* Animated glows */}
            <div className="pointer-events-none absolute -left-20 -top-20 h-[350px] w-[350px] rounded-full bg-[#907AFF]/40 blur-[100px] transition-transform duration-1000 group-hover:translate-x-10 group-hover:translate-y-10" />
            <div className="pointer-events-none absolute -bottom-10 -right-10 h-[250px] w-[250px] rounded-full bg-[#E29ED5]/30 blur-[80px] transition-transform duration-1000 group-hover:-translate-x-5" />
            
            <div className="relative">
              <p className="text-[13px] font-medium uppercase tracking-wider text-white/60">Get started today</p>
              <h2 className="mt-4 text-[36px] font-semibold leading-[1.1] tracking-[-0.02em] text-white md:text-[44px]">
                Ready to reach
                <br />
                <span className="bg-gradient-to-r from-white via-white/80 to-white/60 bg-clip-text text-transparent">more readers?</span>
              </h2>
              <p className="mt-6 max-w-[380px] text-[16px] leading-[1.7] text-white/60">
                Join thousands of authors already turning their books into content that reaches readers everywhere.
              </p>
              
              <div className="mt-10 flex flex-wrap items-center gap-4">
                <GlassSurface
                  {...glassBaseProps}
                  width="auto"
                  height="auto"
                  borderRadius={999}
                  className="glass-button border border-white/25 transition-all hover:scale-[1.02]"
                >
                  <span className="px-8 py-3.5 text-[15px] font-semibold text-white">Start for free</span>
                </GlassSurface>
                <a href="#" className="flex items-center gap-2 text-[15px] text-white/60 transition-colors hover:text-white">
                  Schedule a demo
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </a>
              </div>
            </div>
          </div>

          {/* Right - Stats/Social proof */}
          <div className="flex flex-col gap-6">
            <div className="group relative flex-1 overflow-hidden rounded-[32px] bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-8">
              <div className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-[#907AFF]/20 blur-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
              <div className="relative">
                <div className="flex items-center gap-1">
                  {[1,2,3,4,5].map((i) => (
                    <svg key={i} className="h-5 w-5 text-[#FCC997]" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <p className="mt-3 text-[28px] font-semibold text-white">4.9 out of 5</p>
                <p className="mt-1 text-[14px] text-white/50">Based on 2,000+ author reviews</p>
              </div>
            </div>
            
            <div className="group relative flex-1 overflow-hidden rounded-[32px] bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-8">
              <div className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-[#E29ED5]/20 blur-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
              <div className="relative">
                <div className="flex -space-x-3">
                  {["https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&h=80&fit=crop&crop=face",
                    "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=80&fit=crop&crop=face",
                    "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=80&h=80&fit=crop&crop=face",
                    "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=80&h=80&fit=crop&crop=face",
                    "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=80&h=80&fit=crop&crop=face"
                  ].map((src, i) => (
                    <img key={i} src={src} alt="" className="h-11 w-11 rounded-full border-2 border-[#0a0a0f] object-cover transition-transform duration-300 hover:scale-110 hover:z-10" />
                  ))}
                  <div className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-[#0a0a0f] bg-gradient-to-br from-[#907AFF]/30 to-[#E29ED5]/30 text-[12px] font-semibold text-white">+2k</div>
                </div>
                <p className="mt-4 text-[15px] leading-[1.6] text-white/70">
                  "Verkli helped me turn one story into content that reached millions."
                </p>
                <p className="mt-2 text-[13px] text-white/40">— Emma Richardson, NYT Bestseller</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative mx-auto w-full max-w-[1200px] px-6 pb-12 pt-8">
        <div className="grid gap-12 rounded-[32px] bg-gradient-to-b from-white/[0.04] to-transparent p-10 md:grid-cols-[1.5fr_1fr_1fr_1fr] md:p-12">
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <img src="/favicon.svg" alt="Verkli" className="h-9 w-auto" />
            </div>
            <p className="max-w-[280px] text-[15px] leading-[1.7] text-white/50">
              Where books become momentum. The platform for authors who want to reach readers everywhere.
            </p>
            <div className="flex gap-3 pt-2">
              <a href="#" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.05] text-white/50 transition-all hover:bg-white/[0.1] hover:text-white/80">
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M24 4.557c-.883.392-1.832.656-2.828.775 1.017-.609 1.798-1.574 2.165-2.724-.951.564-2.005.974-3.127 1.195-.897-.957-2.178-1.555-3.594-1.555-3.179 0-5.515 2.966-4.797 6.045-4.091-.205-7.719-2.165-10.148-5.144-1.29 2.213-.669 5.108 1.523 6.574-.806-.026-1.566-.247-2.229-.616-.054 2.281 1.581 4.415 3.949 4.89-.693.188-1.452.232-2.224.084.626 1.956 2.444 3.379 4.6 3.419-2.07 1.623-4.678 2.348-7.29 2.04 2.179 1.397 4.768 2.212 7.548 2.212 9.142 0 14.307-7.721 13.995-14.646.962-.695 1.797-1.562 2.457-2.549z"/></svg>
              </a>
              <a href="#" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.05] text-white/50 transition-all hover:bg-white/[0.1] hover:text-white/80">
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg>
              </a>
              <a href="#" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.05] text-white/50 transition-all hover:bg-white/[0.1] hover:text-white/80">
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.663.967-2.911 2.168-2.911 1.024 0 1.518.769 1.518 1.688 0 1.029-.653 2.567-.992 3.992-.285 1.193.6 2.165 1.775 2.165 2.128 0 3.768-2.245 3.768-5.487 0-2.861-2.063-4.869-5.008-4.869-3.41 0-5.409 2.562-5.409 5.199 0 1.033.394 2.143.889 2.741.099.12.112.225.085.345-.09.375-.293 1.199-.334 1.363-.053.225-.172.271-.401.165-1.495-.69-2.433-2.878-2.433-4.646 0-3.776 2.748-7.252 7.92-7.252 4.158 0 7.392 2.967 7.392 6.923 0 4.135-2.607 7.462-6.233 7.462-1.214 0-2.354-.629-2.758-1.379l-.749 2.848c-.269 1.045-1.004 2.352-1.498 3.146 1.123.345 2.306.535 3.55.535 6.607 0 11.985-5.365 11.985-11.987C23.97 5.39 18.592.026 11.985.026L12.017 0z"/></svg>
              </a>
            </div>
          </div>

          <div className="space-y-4">
            <p className="text-[13px] font-semibold uppercase tracking-wider text-white/40">Product</p>
            <ul className="space-y-3 text-[15px] text-white/50">
              <li><a href="#" className="transition-colors hover:text-white/80">Features</a></li>
              <li><a href="#" className="transition-colors hover:text-white/80">Pricing</a></li>
              <li><a href="#" className="transition-colors hover:text-white/80">Examples</a></li>
              <li><a href="#" className="transition-colors hover:text-white/80">Integrations</a></li>
            </ul>
          </div>

          <div className="space-y-4">
            <p className="text-[13px] font-semibold uppercase tracking-wider text-white/40">Company</p>
            <ul className="space-y-3 text-[15px] text-white/50">
              <li><a href="#" className="transition-colors hover:text-white/80">About</a></li>
              <li><a href="#" className="transition-colors hover:text-white/80">Blog</a></li>
              <li><a href="#" className="transition-colors hover:text-white/80">Careers</a></li>
              <li><a href="#" className="transition-colors hover:text-white/80">Contact</a></li>
            </ul>
          </div>

          <div className="space-y-4">
            <p className="text-[13px] font-semibold uppercase tracking-wider text-white/40">Legal</p>
            <ul className="space-y-3 text-[15px] text-white/50">
              <li><a href="#" className="transition-colors hover:text-white/80">Privacy</a></li>
              <li><a href="#" className="transition-colors hover:text-white/80">Terms</a></li>
              <li><a href="#" className="transition-colors hover:text-white/80">Cookie Policy</a></li>
            </ul>
          </div>
        </div>

        <div className="mt-8 flex flex-col items-center justify-between gap-4 px-4 text-[13px] text-white/30 md:flex-row">
          <span>© 2026 Verkli. All rights reserved.</span>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-green-400"></span>
            <span>All systems operational</span>
          </div>
        </div>
      </footer>
      </div>
    </main>
  )
}
