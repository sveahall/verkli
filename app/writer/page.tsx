"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import GlassSurface from "@/components/GlassSurface";
import GridMotion from "@/components/GridMotion";
import TestimonialSection from "@/components/TestimonialSection";
import StatsSection from "@/components/StatsSection";
import FeaturesSection from "@/components/FeaturesSection";
import ThemeToggle from "@/components/ThemeToggle";
import type { User } from "@supabase/supabase-js";

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

// Dashboard mock data
const mockBooks = [
  { id: 1, title: "Dune", cover: "https://images.unsplash.com/photo-1682687220742-aba13b6e50ba?w=300&h=400&fit=crop", progress: 45 },
  { id: 2, title: "The Story of a Lonely Boy", cover: "https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=300&h=400&fit=crop", progress: 72 },
  { id: 3, title: "Bound by Fate", cover: "https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=300&h=400&fit=crop", progress: 0 },
];

const trendingBooks = [
  { id: 1, title: "Dune", author: "Frank Herbert", cover: "https://images.unsplash.com/photo-1682687220742-aba13b6e50ba?w=300&h=400&fit=crop" },
  { id: 2, title: "Work of Imagination", author: "Sarah Chen", cover: "https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=300&h=400&fit=crop" },
  { id: 3, title: "The Story of a Lonely Boy", author: "Mark Torres", cover: "https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=300&h=400&fit=crop" },
  { id: 4, title: "Dune Messiah", author: "Frank Herbert", cover: "https://images.unsplash.com/photo-1629992101753-56d196c8aabb?w=300&h=400&fit=crop" },
  { id: 5, title: "Foundation", author: "Isaac Asimov", cover: "https://images.unsplash.com/photo-1589998059171-988d887df646?w=300&h=400&fit=crop" },
];

const risingWriters = [
  { id: 1, name: "Ariana Godoy", avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&h=80&fit=crop&crop=face" },
  { id: 2, name: "Sarah Chen", avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=80&fit=crop&crop=face" },
  { id: 3, name: "Mark Torres", avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=80&h=80&fit=crop&crop=face" },
  { id: 4, name: "Emma Wilson", avatar: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=80&h=80&fit=crop&crop=face" },
  { id: 5, name: "James Lee", avatar: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=80&h=80&fit=crop&crop=face" },
  { id: 6, name: "Sofia Martinez", avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=80&h=80&fit=crop&crop=face" },
];

const discoverBooks = [
  { id: 1, title: "Work of Imagination", author: "Sarah Chen", cover: "https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=300&h=400&fit=crop", tag: "FANTASY" },
  { id: 2, title: "Dune", author: "Frank Herbert", cover: "https://images.unsplash.com/photo-1682687220742-aba13b6e50ba?w=300&h=400&fit=crop", tag: "SCI-FI" },
  { id: 3, title: "The Quiet Night", author: "Emma Wilson", cover: "https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=300&h=400&fit=crop", tag: "THRILLER" },
  { id: 4, title: "Sandman", author: "Neil Gaiman", cover: "https://images.unsplash.com/photo-1629992101753-56d196c8aabb?w=300&h=400&fit=crop", tag: "GRAPHIC NOVEL" },
];

const ctaBooks = [
  "https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=200&h=280&fit=crop",
  "https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=200&h=280&fit=crop",
  "https://images.unsplash.com/photo-1682687220742-aba13b6e50ba?w=200&h=280&fit=crop",
  "https://images.unsplash.com/photo-1629992101753-56d196c8aabb?w=200&h=280&fit=crop",
  "https://images.unsplash.com/photo-1589998059171-988d887df646?w=200&h=280&fit=crop",
  "https://images.unsplash.com/photo-1512820790803-83ca734da794?w=200&h=280&fit=crop",
];

// ============================================
// INTERACTIVE TESTIMONIAL SECTION
// ============================================
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

  return (
    <section className="relative mx-auto w-full max-w-[1200px] px-6 py-20">
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-[500px] w-[700px] rounded-full bg-gradient-to-r from-[#907AFF]/5 via-[#E29ED5]/3 to-transparent blur-[120px]" />
      </div>
      <div
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => { setMousePos({ x: 0.5, y: 0.5 }); setIsHovering(false); }}
        className="relative overflow-hidden rounded-[40px] border border-white/[0.08] bg-gradient-to-br from-white/[0.04] via-white/[0.02] to-transparent p-10 md:p-14"
      >
        <div className="pointer-events-none absolute h-[500px] w-[500px] rounded-full blur-[150px] transition-all duration-700 ease-out" style={{ background: "#907AFF", opacity: isHovering ? 0.15 : 0.08, left: `${mousePos.x * 100 - 25}%`, top: `${mousePos.y * 100 - 25}%` }} />
        <div className="pointer-events-none absolute h-[400px] w-[400px] rounded-full blur-[120px] transition-all duration-1000 ease-out" style={{ background: "#E29ED5", opacity: isHovering ? 0.12 : 0.06, left: `${(1 - mousePos.x) * 100 - 20}%`, top: `${(1 - mousePos.y) * 100 - 20}%` }} />
        <div className="pointer-events-none absolute h-[300px] w-[300px] rounded-full blur-[100px] transition-all duration-500 ease-out" style={{ background: "#FCC997", opacity: isHovering ? 0.1 : 0.04, left: `${mousePos.x * 80 + 10}%`, top: `${mousePos.y * 60 + 20}%` }} />
        <div className="relative grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-14">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#907AFF]/20 bg-[#907AFF]/5 px-3 py-1">
              <div className="h-1.5 w-1.5 rounded-full bg-[#907AFF]" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#907AFF]">Social proof</span>
            </div>
            <h2 className="text-[40px] font-semibold leading-[1.05] tracking-[-0.02em] text-white md:text-[52px]">
              Authors love<br /><span className="bg-gradient-to-r from-white/40 to-white/20 bg-clip-text text-transparent">what we do.</span>
            </h2>
            <p className="mt-6 max-w-[380px] text-[16px] leading-[1.7] text-white/50">Join thousands of writers who use Verkli to turn their stories into content that reaches readers everywhere.</p>
            <div className="mt-8 flex items-center gap-4">
              <Link href="/writer/signup">
                <GlassSurface {...glassBaseProps} width="auto" height="auto" borderRadius={999} className="glass-button border border-[#907AFF]/30 transition-all hover:scale-[1.02] hover:border-[#907AFF]/50">
                  <span className="px-7 py-3 text-[14px] font-medium text-white">Start for free</span>
                </GlassSurface>
              </Link>
              <a href="#" className="text-[14px] text-white/50 underline underline-offset-4 transition-colors hover:text-white/70">Read case studies</a>
            </div>
          </div>
          <div className="space-y-4">
            <div className="rounded-3xl bg-white/[0.04] p-8 backdrop-blur-sm">
              <p className="text-[20px] font-normal leading-[1.5] tracking-[-0.01em] text-white/90">&quot;Fable helped me turn one story into content that reached millions. The success has been incredible.&quot;</p>
              <div className="mt-6 flex items-center gap-4">
                <img src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&h=80&fit=crop&crop=face" alt="Ariana Godoy" className="h-11 w-11 rounded-full object-cover" />
                <div><div className="text-[15px] font-medium text-white">Ariana Godoy</div><div className="text-[13px] text-white/50">Bestselling author</div></div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-2xl bg-white/[0.04] p-5 backdrop-blur-sm">
                <p className="text-[14px] leading-relaxed text-white/80">&quot;My launch stayed visible for weeks.&quot;</p>
                <div className="mt-4 flex items-center gap-3">
                  <img src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=60&h=60&fit=crop&crop=face" alt="Sarah Chen" className="h-8 w-8 rounded-full object-cover" />
                  <div className="text-[13px] text-white/50">Sarah Chen</div>
                </div>
              </div>
              <div className="rounded-2xl bg-white/[0.04] p-5 backdrop-blur-sm">
                <p className="text-[14px] leading-relaxed text-white/80">&quot;BookTok finally clicked for me.&quot;</p>
                <div className="mt-4 flex items-center gap-3">
                  <img src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=60&h=60&fit=crop&crop=face" alt="Mark Torres" className="h-8 w-8 rounded-full object-cover" />
                  <div className="text-[13px] text-white/50">Mark Torres</div>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-2xl bg-white/[0.04] px-6 py-5 backdrop-blur-sm">
              <div className="text-center"><div className="text-xl font-semibold tracking-tight text-white">12,000+</div><div className="mt-0.5 text-[11px] text-white/40">authors</div></div>
              <div className="h-8 w-px bg-white/10" />
              <div className="text-center"><div className="text-xl font-semibold tracking-tight text-white">4.9/5</div><div className="mt-0.5 text-[11px] text-white/40">rating</div></div>
              <div className="h-8 w-px bg-white/10" />
              <div className="text-center"><div className="text-xl font-semibold tracking-tight text-white">89%</div><div className="mt-0.5 text-[11px] text-white/40">time saved</div></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ============================================
// LANDING PAGE (for non-authenticated users)
// ============================================
function LandingPage() {
  const [heroMousePos, setHeroMousePos] = useState({ x: 0.5, y: 0.5 });
  const heroRef = useRef<HTMLElement>(null);

  const handleHeroMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    if (!heroRef.current) return;
    const rect = heroRef.current.getBoundingClientRect();
    setHeroMousePos({ x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height });
  };

  return (
    <main className="relative min-h-screen bg-background text-foreground transition-colors duration-300">
      <header className="sticky top-6 z-20 mx-auto w-full max-w-[1660px] px-6">
        <GlassSurface {...glassBaseProps} width="100%" height="75px" borderRadius={300} className="w-full border border-black/10 px-6 py-4 dark:border-white/10 md:px-10 [&_.glass-surface__content]:w-full [&_.glass-surface__content]:justify-between [&_.glass-surface__content]:p-0">
          <nav className="flex w-full items-center justify-between gap-6">
            <div className="flex items-center gap-10">
              <img src="/favicon.svg" alt="Verkli" className="h-8 w-auto" loading="eager" />
              <div className="hidden items-center gap-10 text-[17px] font-normal text-slate-900 dark:text-white lg:flex">
                {["Features", "Integrations", "Examples", "FAQ"].map((item) => (
                  <button key={item} className="nav-item flex items-center gap-2">
                    <span>{item}</span>
                    <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 4.5L6 7.5L9 4.5" /></svg>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/writer/signin" className="sign-in-button px-6 text-[17px] font-regular text-slate-900 transition hover:text-slate-600 dark:text-white dark:hover:text-white/70">Sign in</Link>
              <Link href="/writer/signup">
                <GlassSurface {...glassBaseProps} width="auto" height="auto" borderRadius={999} className="glass-surface--button border border-black/10 transition-transform hover:scale-[1.02] dark:border-white/10">
                  <span className="sign-up-button px-7 py-0 text-[17px] font-medium text-slate-900 dark:text-[#F7F7F7]">Sign up</span>
                </GlassSurface>
              </Link>
              <div className="divider hidden h-8 w-px bg-black/10 dark:bg-white/20 md:block" />
              <div className="hidden items-center gap-3 md:flex">
                <ThemeToggle glassProps={glassBaseProps} />
                <GlassSurface {...glassBaseProps} width="auto" height="auto" borderRadius={999} className="glass-surface--button">
                  <button className="language-toggle flex items-center justify-center px-3.5 py-2.5 text-slate-900 dark:text-white" aria-label="Change language">
                    <svg width="48" height="18" viewBox="0 0 48 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M11.5083 11.1435L7.74534 0.305126C7.7102 0.203899 7.56721 0.203408 7.53137 0.304391L3.6371 11.2769" stroke="currentColor" strokeWidth="1.70079" strokeLinecap="round"/>
                      <path d="M5.07678 7.75988H10.1083" stroke="currentColor" strokeWidth="1.70079"/>
                      <path d="M16.3801 8.53955L26.4786 8.53955" stroke="currentColor" strokeWidth="1.70079" strokeLinecap="round"/>
                      <path d="M21.4293 5.89978L21.4293 8.53782" stroke="currentColor" strokeWidth="1.70079" strokeLinecap="round"/>
                      <path d="M16.3801 17.7874C23.4667 14.9174 24.2817 10.5237 24.8841 8.61028" stroke="currentColor" strokeWidth="1.70079" strokeLinecap="round"/>
                      <path d="M18.1516 11.7992C19.0847 13.4645 20.8445 15.9803 24.8485 17.8228" stroke="currentColor" strokeWidth="1.70079" strokeLinecap="round"/>
                      <path d="M42.1928 11.352C42.3576 11.5177 42.6286 11.5177 42.7934 11.352L47.0454 7.07497C47.2101 6.90924 47.2101 6.63658 47.0454 6.47084C46.8806 6.30511 46.6095 6.30511 46.4448 6.47084L42.4931 10.4458L38.5414 6.47084C38.3767 6.30511 38.1056 6.30511 37.9408 6.47084C37.7761 6.63658 37.7761 6.90924 37.9408 7.07497L42.1928 11.352Z" fill="currentColor"/>
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
        <section ref={heroRef} onMouseMove={handleHeroMouseMove} className="relative isolate mx-auto my-auto flex min-h-screen w-full max-w-[1800px] flex-col items-center justify-center overflow-hidden px-6 pb-50 text-center">
          <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
            <div className="relative h-full w-full">
              <div className="absolute inset-0 z-0"><GridMotion items={gridItems} gradientColor="black" rows={gridRows} cols={gridCols} /></div>
              <div className="absolute inset-0 z-10 bg-white/75 dark:bg-black/70" />
              <div className="absolute inset-0 z-11 bg-gradient-to-b from-white via-transparent to-white dark:from-[#050508] dark:to-[#050508]" />
              <div className="absolute z-12 h-[600px] w-[600px] rounded-full blur-[180px] transition-all duration-1000 ease-out" style={{ background: "#907AFF", opacity: 0.15, left: `${heroMousePos.x * 100 - 30}%`, top: `${heroMousePos.y * 100 - 30}%` }} />
              <div className="absolute z-12 h-[400px] w-[400px] rounded-full blur-[150px] transition-all duration-[1500ms] ease-out" style={{ background: "#E29ED5", opacity: 0.1, left: `${(1 - heroMousePos.x) * 100 - 20}%`, top: `${heroMousePos.y * 100 - 20}%` }} />
              <div className="absolute z-12 h-[300px] w-[300px] rounded-full blur-[120px] transition-all duration-700 ease-out" style={{ background: "#FCC997", opacity: 0.08, left: `${heroMousePos.x * 70 + 15}%`, top: `${(1 - heroMousePos.y) * 60 + 20}%` }} />
            </div>
          </div>
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-black/10 bg-black/5 px-4 py-2 backdrop-blur-sm transition-transform duration-300 hover:scale-105 dark:border-white/10 dark:bg-white/[0.03]">
            <div className="h-2 w-2 animate-pulse rounded-full bg-[#907AFF]" />
            <span className="text-[13px] text-slate-600 dark:text-white/60">Now in public beta</span>
          </div>
          <h1 className="text-[52px] font-semibold leading-[1.05] tracking-[-0.03em] text-slate-900 dark:text-white md:text-[80px]">Write once.<br /><span className="bg-gradient-to-r from-slate-400/50 via-slate-400/30 to-slate-400/50 bg-clip-text text-transparent dark:from-white/50 dark:via-white/30 dark:to-white/50">Show up everywhere.</span></h1>
          <p className="mt-8 max-w-[520px] text-[17px] leading-relaxed text-slate-600 dark:text-white/50 md:text-[18px]">The platform for authors to turn books into content, connect with readers, and build sustainable revenue.</p>
          <div className="mt-10 flex items-center gap-4">
            <Link href="/writer/signup">
              <GlassSurface {...glassBaseProps} width="auto" height="auto" borderRadius={999} className="glass-button border border-[#907AFF]/30 transition-all hover:scale-[1.02] hover:border-[#907AFF]/50">
                <span className="px-8 py-3.5 text-[15px] font-medium text-slate-900 dark:text-white">Get started free</span>
              </GlassSurface>
            </Link>
            <a href="#features" className="group flex items-center gap-2 text-[15px] text-slate-500 transition-colors hover:text-slate-700 dark:text-white/50 dark:hover:text-white/70">See how it works<svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg></a>
          </div>
          <div className="absolute bottom-12 left-1/2 -translate-x-1/2">
            <div className="flex h-10 w-6 items-start justify-center rounded-full border border-black/20 p-1.5 transition-colors duration-300 hover:border-black/40 dark:border-white/20 dark:hover:border-white/40">
              <div className="h-2 w-1 animate-bounce rounded-full bg-black/30 dark:bg-white/40" style={{ animationDuration: "1.5s" }} />
            </div>
          </div>
        </section>

        {/* Bento Grid */}
        <section className="relative mx-auto w-full max-w-[1200px] px-6 py-16">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div className="group relative col-span-full overflow-hidden rounded-[32px] bg-gradient-to-br from-[#907AFF]/20 via-[#E29ED5]/10 to-[#FCC997]/10 p-10 lg:col-span-2 lg:p-12">
              <div className="pointer-events-none absolute -right-20 -top-20 h-[400px] w-[400px] rounded-full bg-[#907AFF]/20 blur-[100px] transition-transform duration-1000 group-hover:translate-x-10" />
              <div className="pointer-events-none absolute -bottom-20 -left-20 h-[300px] w-[300px] rounded-full bg-[#E29ED5]/15 blur-[80px]" />
              <div className="relative max-w-[500px]">
                <h2 className="text-[36px] font-semibold leading-[1.1] tracking-[-0.02em] text-white md:text-[48px]">Zero friction<br /><span className="bg-gradient-to-r from-[#907AFF] via-[#E29ED5] to-[#FCC997] bg-clip-text text-transparent">book marketing.</span></h2>
                <p className="mt-6 max-w-[420px] text-[17px] leading-[1.7] text-white/60">An end-to-end platform that turns your book into structured content — easy to publish, adapt, and scale.</p>
                <div className="mt-8">
                  <Link href="/writer/signup">
                    <GlassSurface {...glassBaseProps} width="auto" height="auto" borderRadius={999} className="glass-button inline-flex border border-white/20 transition-all hover:scale-[1.02]">
                      <span className="px-7 py-3 text-[15px] font-medium text-white">Start for free</span>
                    </GlassSurface>
                  </Link>
                </div>
              </div>
            </div>
            <div className="group relative overflow-hidden rounded-[32px] bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-8">
              <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-[#FCC997]/20 blur-3xl opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
              <div className="relative flex h-full flex-col justify-between">
                <div>
                  <div className="mb-2 flex items-center gap-1">{[1,2,3,4,5].map((i) => (<svg key={i} className="h-4 w-4 text-[#FCC997]" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>))}</div>
                  <p className="text-[40px] font-semibold text-white">4.9/5</p>
                  <p className="mt-1 text-[14px] text-white/50">Average rating from authors</p>
                </div>
                <div className="mt-6 flex -space-x-2">
                  {["https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&h=80&fit=crop&crop=face","https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=80&fit=crop&crop=face","https://images.unsplash.com/photo-1517841905240-472988babdf9?w=80&h=80&fit=crop&crop=face","https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=80&h=80&fit=crop&crop=face"].map((src, i) => (<img key={i} src={src} alt="" className="h-9 w-9 rounded-full border-2 border-[#0a0a0f] object-cover transition-transform duration-300 hover:z-10 hover:scale-110" />))}
                  <div className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#0a0a0f] bg-white/10 text-[11px] font-medium text-white/70">+2k</div>
                </div>
              </div>
            </div>
            {[{ title: "No credit card", desc: "Start free, upgrade anytime", color: "#907AFF" },{ title: "2 min setup", desc: "Go live in minutes", color: "#E29ED5" },{ title: "10+ platforms", desc: "Publish everywhere", color: "#FCC997" }].map((item) => (
              <div key={item.title} className="group relative overflow-hidden rounded-[24px] bg-gradient-to-br from-white/[0.05] to-transparent p-6 transition-all duration-500 hover:from-white/[0.08]">
                <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full blur-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-50" style={{ background: item.color }} />
                <div className="relative"><div className="mb-3 h-2 w-2 rounded-full" style={{ background: item.color }} /><p className="text-[17px] font-medium text-white">{item.title}</p><p className="mt-1 text-[14px] text-white/50">{item.desc}</p></div>
              </div>
            ))}
          </div>
        </section>

        <TestimonialSection />
        <StatsSection />
        <FeaturesSection />
        <InteractiveTestimonialSection />

        {/* Why Verkli */}
        <section className="mx-auto w-full max-w-[1200px] px-6 py-24">
          <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr] lg:items-center">
            <div>
              <p className="text-[13px] font-medium uppercase tracking-wider text-[#E29ED5]">Why Verkli</p>
              <h2 className="mt-4 text-[36px] font-semibold leading-[1.1] tracking-[-0.02em] text-white md:text-[44px]">Everything you need to<br /><span className="bg-gradient-to-r from-[#907AFF] via-[#E29ED5] to-[#FCC997] bg-clip-text text-transparent">grow your audience.</span></h2>
              <p className="mt-6 max-w-[400px] text-[16px] leading-[1.7] text-white/50">Simple tools that help you reach readers without the complexity.</p>
              <div className="mt-8">
                <Link href="/writer/signup">
                  <GlassSurface {...glassBaseProps} width="auto" height="auto" borderRadius={999} className="glass-button inline-flex border border-white/15 transition-all hover:scale-[1.02]">
                    <span className="px-7 py-3 text-[15px] font-medium text-white">Explore features</span>
                  </GlassSurface>
                </Link>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {[{ title: "Get discovered", description: "Turn your book into scroll-stopping content for TikTok and beyond.", color: "#907AFF" },{ title: "Grow your audience", description: "Reach readers before they buy. Build momentum with content.", color: "#E29ED5" },{ title: "Automate marketing", description: "AI-generated hooks, scripts, and captions. Without daily effort.", color: "#FCC997" },{ title: "Focus on writing", description: "Upload a chapter, get content. No complex tools needed.", color: "#FEE9A3" }].map((item) => (
                <div key={item.title} className="group relative overflow-hidden rounded-[24px] border border-white/[0.06] bg-gradient-to-br from-white/[0.04] to-transparent p-6 transition-all duration-500 hover:border-white/[0.12] hover:from-white/[0.06]">
                  <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full blur-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-50" style={{ background: item.color }} />
                  <div className="relative">
                    <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl transition-transform duration-500 group-hover:scale-110" style={{ background: `linear-gradient(135deg, ${item.color}25, ${item.color}10)` }}><div className="h-2 w-2 rounded-full" style={{ background: item.color }} /></div>
                    <h3 className="text-[17px] font-semibold text-white">{item.title}</h3>
                    <p className="mt-2 text-[14px] leading-[1.6] text-white/50">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="relative mx-auto w-full max-w-[1200px] px-6 py-24">
          <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
            <div className="group relative overflow-hidden rounded-[40px] bg-gradient-to-br from-[#907AFF]/30 via-[#E29ED5]/20 to-[#FCC997]/15 p-10 md:p-14">
              <div className="pointer-events-none absolute -left-20 -top-20 h-[350px] w-[350px] rounded-full bg-[#907AFF]/40 blur-[100px] transition-transform duration-1000 group-hover:translate-x-10 group-hover:translate-y-10" />
              <div className="pointer-events-none absolute -bottom-10 -right-10 h-[250px] w-[250px] rounded-full bg-[#E29ED5]/30 blur-[80px] transition-transform duration-1000 group-hover:-translate-x-5" />
              <div className="relative">
                <p className="text-[13px] font-medium uppercase tracking-wider text-white/60">Get started today</p>
                <h2 className="mt-4 text-[36px] font-semibold leading-[1.1] tracking-[-0.02em] text-white md:text-[44px]">Ready to reach<br /><span className="bg-gradient-to-r from-white via-white/80 to-white/60 bg-clip-text text-transparent">more readers?</span></h2>
                <p className="mt-6 max-w-[380px] text-[16px] leading-[1.7] text-white/60">Join thousands of authors already turning their books into content that reaches readers everywhere.</p>
                <div className="mt-10 flex flex-wrap items-center gap-4">
                  <Link href="/writer/signup">
                    <GlassSurface {...glassBaseProps} width="auto" height="auto" borderRadius={999} className="glass-button border border-white/25 transition-all hover:scale-[1.02]">
                      <span className="px-8 py-3.5 text-[15px] font-semibold text-white">Start for free</span>
                    </GlassSurface>
                  </Link>
                  <a href="#" className="flex items-center gap-2 text-[15px] text-white/60 transition-colors hover:text-white">Schedule a demo<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg></a>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-6">
              <div className="group relative flex-1 overflow-hidden rounded-[32px] bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-8">
                <div className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-[#907AFF]/20 blur-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                <div className="relative">
                  <div className="flex items-center gap-1">{[1,2,3,4,5].map((i) => (<svg key={i} className="h-5 w-5 text-[#FCC997]" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>))}</div>
                  <p className="mt-3 text-[28px] font-semibold text-white">4.9 out of 5</p>
                  <p className="mt-1 text-[14px] text-white/50">Based on 2,000+ author reviews</p>
                </div>
              </div>
              <div className="group relative flex-1 overflow-hidden rounded-[32px] bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-8">
                <div className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-[#E29ED5]/20 blur-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                <div className="relative">
                  <div className="flex -space-x-3">{["https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&h=80&fit=crop&crop=face","https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=80&fit=crop&crop=face","https://images.unsplash.com/photo-1517841905240-472988babdf9?w=80&h=80&fit=crop&crop=face","https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=80&h=80&fit=crop&crop=face","https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=80&h=80&fit=crop&crop=face"].map((src, i) => (<img key={i} src={src} alt="" className="h-11 w-11 rounded-full border-2 border-[#0a0a0f] object-cover transition-transform duration-300 hover:z-10 hover:scale-110" />))}<div className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-[#0a0a0f] bg-gradient-to-br from-[#907AFF]/30 to-[#E29ED5]/30 text-[12px] font-semibold text-white">+2k</div></div>
                  <p className="mt-4 text-[15px] leading-[1.6] text-white/70">&quot;Verkli helped me turn one story into content that reached millions.&quot;</p>
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
              <img src="/favicon.svg" alt="Verkli" className="h-9 w-auto" />
              <p className="max-w-[280px] text-[15px] leading-[1.7] text-white/50">Where books become momentum. The platform for authors who want to reach readers everywhere.</p>
              <div className="flex gap-3 pt-2">
                <a href="#" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.05] text-white/50 transition-all hover:bg-white/[0.1] hover:text-white/80"><svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M24 4.557c-.883.392-1.832.656-2.828.775 1.017-.609 1.798-1.574 2.165-2.724-.951.564-2.005.974-3.127 1.195-.897-.957-2.178-1.555-3.594-1.555-3.179 0-5.515 2.966-4.797 6.045-4.091-.205-7.719-2.165-10.148-5.144-1.29 2.213-.669 5.108 1.523 6.574-.806-.026-1.566-.247-2.229-.616-.054 2.281 1.581 4.415 3.949 4.89-.693.188-1.452.232-2.224.084.626 1.956 2.444 3.379 4.6 3.419-2.07 1.623-4.678 2.348-7.29 2.04 2.179 1.397 4.768 2.212 7.548 2.212 9.142 0 14.307-7.721 13.995-14.646.962-.695 1.797-1.562 2.457-2.549z"/></svg></a>
                <a href="#" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.05] text-white/50 transition-all hover:bg-white/[0.1] hover:text-white/80"><svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg></a>
                <a href="#" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.05] text-white/50 transition-all hover:bg-white/[0.1] hover:text-white/80"><svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.663.967-2.911 2.168-2.911 1.024 0 1.518.769 1.518 1.688 0 1.029-.653 2.567-.992 3.992-.285 1.193.6 2.165 1.775 2.165 2.128 0 3.768-2.245 3.768-5.487 0-2.861-2.063-4.869-5.008-4.869-3.41 0-5.409 2.562-5.409 5.199 0 1.033.394 2.143.889 2.741.099.12.112.225.085.345-.09.375-.293 1.199-.334 1.363-.053.225-.172.271-.401.165-1.495-.69-2.433-2.878-2.433-4.646 0-3.776 2.748-7.252 7.92-7.252 4.158 0 7.392 2.967 7.392 6.923 0 4.135-2.607 7.462-6.233 7.462-1.214 0-2.354-.629-2.758-1.379l-.749 2.848c-.269 1.045-1.004 2.352-1.498 3.146 1.123.345 2.306.535 3.55.535 6.607 0 11.985-5.365 11.985-11.987C23.97 5.39 18.592.026 11.985.026L12.017 0z"/></svg></a>
              </div>
            </div>
            <div className="space-y-4"><p className="text-[13px] font-semibold uppercase tracking-wider text-white/40">Product</p><ul className="space-y-3 text-[15px] text-white/50"><li><a href="#" className="transition-colors hover:text-white/80">Features</a></li><li><a href="#" className="transition-colors hover:text-white/80">Pricing</a></li><li><a href="#" className="transition-colors hover:text-white/80">Examples</a></li><li><a href="#" className="transition-colors hover:text-white/80">Integrations</a></li></ul></div>
            <div className="space-y-4"><p className="text-[13px] font-semibold uppercase tracking-wider text-white/40">Company</p><ul className="space-y-3 text-[15px] text-white/50"><li><a href="#" className="transition-colors hover:text-white/80">About</a></li><li><a href="#" className="transition-colors hover:text-white/80">Blog</a></li><li><a href="#" className="transition-colors hover:text-white/80">Careers</a></li><li><a href="#" className="transition-colors hover:text-white/80">Contact</a></li></ul></div>
            <div className="space-y-4"><p className="text-[13px] font-semibold uppercase tracking-wider text-white/40">Legal</p><ul className="space-y-3 text-[15px] text-white/50"><li><a href="#" className="transition-colors hover:text-white/80">Privacy</a></li><li><a href="#" className="transition-colors hover:text-white/80">Terms</a></li><li><a href="#" className="transition-colors hover:text-white/80">Cookie Policy</a></li></ul></div>
          </div>
          <div className="mt-8 flex flex-col items-center justify-between gap-4 px-4 text-[13px] text-white/30 md:flex-row">
            <span>© 2026 Verkli. All rights reserved.</span>
            <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-green-400"></span><span>All systems operational</span></div>
          </div>
        </footer>
      </div>
    </main>
  );
}

// ============================================
// DASHBOARD (for authenticated users)
// ============================================
function Dashboard({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const [shelves, setShelves] = useState([{ id: 1, name: "New Shelf", books: mockBooks.slice(0, 2) }]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) setProfileMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const displayName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Writer";

  return (
    <main className="min-h-screen bg-[#050508] text-white">
      <header className="sticky top-6 z-50 mx-auto w-full max-w-[1660px] px-6">
        <div className="flex items-center gap-3">
          <GlassSurface {...glassBaseProps} width="100%" height="75px" borderRadius={300} className="flex-1 border border-white/10 px-6 py-4 md:px-10 [&_.glass-surface__content]:w-full [&_.glass-surface__content]:justify-between [&_.glass-surface__content]:p-0">
            <nav className="flex w-full items-center justify-between gap-6">
              <div className="flex items-center gap-10">
                <Link href="/writer"><img src="/favicon.svg" alt="Verkli" className="h-8 w-auto" /></Link>
                <div className="hidden items-center gap-10 text-[17px] font-normal text-white lg:flex">
                  <Link href="/writer" className="nav-item transition-colors hover:text-white/70">Home</Link>
                  {["Features", "Integrations", "Examples", "FAQ"].map((item) => (<button key={item} className="nav-item flex items-center gap-2 transition-colors hover:text-white/70"><span>{item}</span><svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 4.5L6 7.5L9 4.5" /></svg></button>))}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="hidden md:block"><div className="flex h-10 w-[280px] items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4"><svg className="h-4 w-4 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg><input type="text" placeholder="Search books, authors..." className="flex-1 bg-transparent text-[14px] text-white placeholder-white/40 outline-none" /></div></div>
                <button className="rounded-full bg-[#907AFF] px-6 py-2.5 text-[15px] font-medium text-white transition-all hover:bg-[#8069EE]">Create</button>
              </div>
            </nav>
          </GlassSurface>
          <div className="relative" ref={profileMenuRef}>
            <button onClick={() => setProfileMenuOpen(!profileMenuOpen)} className="flex h-[75px] w-[75px] items-center justify-center rounded-full border border-white/10 bg-gradient-to-br from-[#907AFF]/20 to-[#E29ED5]/20 backdrop-blur-xl transition-all hover:border-white/20">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[#907AFF] to-[#E29ED5] text-[18px] font-semibold text-white">{displayName.charAt(0).toUpperCase()}</span>
            </button>
            {profileMenuOpen && (
              <div className="absolute right-0 top-full mt-3 w-[260px] overflow-hidden rounded-2xl border border-white/10 bg-[#0a0a0f]/95 p-2 shadow-2xl backdrop-blur-xl">
                <div className="border-b border-white/[0.06] px-4 pb-4 pt-3"><p className="text-[15px] font-medium text-white">{displayName}</p><p className="mt-1 text-[13px] text-white/50">{user?.email}</p></div>
                <div className="py-2">
                  <button className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-[14px] text-white/70 transition-colors hover:bg-white/[0.05] hover:text-white"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>Profile</button>
                  <button className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-[14px] text-white/70 transition-colors hover:bg-white/[0.05] hover:text-white"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>Settings</button>
                  <Link href="/reader" className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-[14px] text-white/70 transition-colors hover:bg-white/[0.05] hover:text-white"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>Switch to Reader</Link>
                </div>
                <div className="border-t border-white/[0.06] pt-2"><button onClick={onSignOut} className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-[14px] text-red-400/80 transition-colors hover:bg-red-500/10 hover:text-red-400"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>Sign out</button></div>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1400px] px-6 py-12">
        <section className="mb-14"><h1 className="text-[32px] font-semibold tracking-[-0.02em] text-white">{displayName}&apos;s world</h1><p className="mt-2 text-[15px] text-white/50">Your collection. Your masterpieces.</p></section>

        {/* My Library */}
        <section className="mb-20">
          <div className="mb-6 flex items-center justify-between"><h2 className="text-[20px] font-semibold text-white">My library</h2><button className="rounded-full border border-white/10 bg-white/[0.03] px-5 py-2 text-[13px] font-medium text-white/70 transition-all hover:bg-white/[0.06]">See all</button></div>
          <div className="rounded-3xl border border-white/[0.08] bg-gradient-to-b from-white/[0.04] to-transparent p-8">
            {shelves.map((shelf, index) => (
              <div key={shelf.id} className={index > 0 ? "mt-8 border-t border-white/[0.06] pt-8" : ""}>
                <div className="mb-5 flex items-center gap-3"><input type="text" value={shelf.name} onChange={(e) => { const newShelves = [...shelves]; newShelves[index].name = e.target.value; setShelves(newShelves); }} className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-[14px] text-white outline-none transition-all focus:border-[#907AFF]/50 focus:bg-white/[0.06]" /></div>
                <div className="flex flex-wrap gap-5">
                  {shelf.books.map((book) => (<div key={book.id} className="group relative cursor-pointer"><div className="h-[180px] w-[120px] overflow-hidden rounded-xl bg-white/[0.05] shadow-lg transition-all duration-300 group-hover:scale-105 group-hover:shadow-xl group-hover:shadow-[#907AFF]/10"><img src={book.cover} alt={book.title} className="h-full w-full object-cover" /></div>{book.progress > 0 && (<div className="absolute bottom-3 left-3 right-3"><div className="h-1.5 overflow-hidden rounded-full bg-black/60 backdrop-blur-sm"><div className="h-full bg-gradient-to-r from-[#907AFF] to-[#E29ED5]" style={{ width: `${book.progress}%` }}></div></div></div>)}</div>))}
                  <button className="flex h-[180px] w-[120px] items-center justify-center rounded-xl border-2 border-dashed border-white/10 bg-white/[0.02] transition-all hover:border-[#907AFF]/30 hover:bg-white/[0.04]"><div className="flex flex-col items-center gap-2"><svg className="h-8 w-8 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" /></svg><span className="text-[11px] text-white/30">Add book</span></div></button>
                </div>
              </div>
            ))}
            <button onClick={() => setShelves([...shelves, { id: Date.now(), name: "New Shelf", books: [] }])} className="mt-8 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-white/10 py-4 text-[14px] text-white/50 transition-all hover:border-[#907AFF]/30 hover:bg-white/[0.02] hover:text-white/70"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" /></svg>Add another shelf/book</button>
          </div>
        </section>

        {/* Continue Reading */}
        <section className="mb-20">
          <div className="mb-4"><p className="text-[11px] font-semibold uppercase tracking-wider text-[#907AFF]">CONTINUE READING</p><p className="mt-1 text-[14px] text-white/50">Jump back in</p></div>
          <div className="flex gap-5 overflow-x-auto pb-4">{mockBooks.filter(b => b.progress > 0).map((book) => (<div key={book.id} className="group relative flex-shrink-0 cursor-pointer"><div className="h-[160px] w-[110px] overflow-hidden rounded-xl bg-white/[0.05] shadow-lg transition-all duration-300 group-hover:scale-105 group-hover:shadow-xl group-hover:shadow-[#907AFF]/10"><img src={book.cover} alt={book.title} className="h-full w-full object-cover" /></div><div className="absolute bottom-3 left-3 right-3"><div className="h-1.5 overflow-hidden rounded-full bg-black/60 backdrop-blur-sm"><div className="h-full bg-gradient-to-r from-[#907AFF] to-[#E29ED5]" style={{ width: `${book.progress}%` }}></div></div></div></div>))}</div>
        </section>

        {/* Explore More */}
        <section className="mb-20">
          <h2 className="mb-10 text-[28px] font-semibold tracking-[-0.02em] text-white">Explore more</h2>
          <div className="mb-12"><div className="mb-5 flex items-center justify-between"><div><p className="text-[11px] font-semibold uppercase tracking-wider text-[#E29ED5]">TRENDING NOW</p><p className="mt-1 text-[14px] text-white/50">What readers are enjoying right now</p></div><div className="flex gap-2"><button className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-white/50 transition-all hover:border-white/20 hover:bg-white/[0.03] hover:text-white"><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg></button><button className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-white/50 transition-all hover:border-white/20 hover:bg-white/[0.03] hover:text-white"><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg></button></div></div><div className="flex gap-5 overflow-x-auto pb-4">{trendingBooks.map((book) => (<div key={book.id} className="group flex-shrink-0 cursor-pointer"><div className="relative h-[200px] w-[140px] overflow-hidden rounded-2xl bg-white/[0.05] shadow-lg transition-all duration-300 group-hover:scale-105 group-hover:shadow-xl group-hover:shadow-[#907AFF]/10"><img src={book.cover} alt={book.title} className="h-full w-full object-cover" /><div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent"></div><div className="absolute bottom-4 left-4 right-4"><p className="truncate text-[14px] font-medium text-white">{book.title}</p><p className="truncate text-[12px] text-white/60">{book.author}</p></div></div></div>))}</div></div>
          <div className="mb-12"><div className="mb-5"><p className="text-[11px] font-semibold uppercase tracking-wider text-[#FCC997]">WRITERS ON THE RISE</p><p className="mt-1 text-[14px] text-white/50">Creators gaining momentum</p></div><div className="flex gap-6 overflow-x-auto pb-4">{risingWriters.map((writer) => (<div key={writer.id} className="group flex flex-shrink-0 cursor-pointer flex-col items-center"><div className="relative"><div className="h-[72px] w-[72px] overflow-hidden rounded-full border-2 border-white/10 transition-all duration-300 group-hover:border-[#907AFF]/50 group-hover:shadow-lg group-hover:shadow-[#907AFF]/20"><img src={writer.avatar} alt={writer.name} className="h-full w-full object-cover" /></div><div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-[#907AFF] to-[#E29ED5] shadow-lg"><svg className="h-3.5 w-3.5 text-white" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg></div></div><p className="mt-3 text-[13px] font-medium text-white/70 transition-colors group-hover:text-white">{writer.name.split(" ")[0]}</p></div>))}</div></div>
          <div><div className="mb-5 flex items-center justify-between"><div><p className="text-[11px] font-semibold uppercase tracking-wider text-[#FEE9A3]">DISCOVER NEW READS</p><p className="mt-1 text-[14px] text-white/50">What readers are enjoying right now</p></div><div className="flex gap-2"><button className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-white/50 transition-all hover:border-white/20 hover:bg-white/[0.03] hover:text-white"><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg></button><button className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-white/50 transition-all hover:border-white/20 hover:bg-white/[0.03] hover:text-white"><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg></button></div></div><div className="flex gap-5 overflow-x-auto pb-4">{discoverBooks.map((book) => (<div key={book.id} className="group flex-shrink-0 cursor-pointer"><div className="relative h-[200px] w-[140px] overflow-hidden rounded-2xl bg-white/[0.05] shadow-lg transition-all duration-300 group-hover:scale-105 group-hover:shadow-xl group-hover:shadow-[#907AFF]/10"><img src={book.cover} alt={book.title} className="h-full w-full object-cover" /><div className="absolute left-3 top-3"><span className="rounded-full bg-black/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/90 backdrop-blur-sm">{book.tag}</span></div><div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent"></div><div className="absolute bottom-4 left-4 right-4"><p className="truncate text-[14px] font-medium text-white">{book.title}</p><p className="truncate text-[12px] text-white/60">{book.author}</p></div></div></div>))}</div></div>
        </section>

        {/* CTA */}
        <section className="mb-20">
          <div className="overflow-hidden rounded-[40px] border border-white/[0.08] bg-gradient-to-b from-white/[0.06] to-white/[0.02]">
            <div className="px-10 py-14 text-center"><h2 className="text-[32px] font-semibold tracking-[-0.02em] text-white">Ready to turn your book into content?</h2><p className="mt-3 text-[15px] text-white/50">Upload a chapter and reach more readers across all platforms.</p><button className="mt-8 rounded-full bg-[#907AFF] px-8 py-3.5 text-[15px] font-medium text-white transition-all hover:bg-[#8069EE]">Get started</button></div>
            <div className="relative h-[220px] overflow-hidden"><div className="absolute inset-0 z-10 bg-gradient-to-t from-[#050508] via-transparent to-transparent"></div><div className="flex animate-scroll gap-5 px-4">{[...ctaBooks, ...ctaBooks, ...ctaBooks].map((cover, index) => (<div key={index} className="h-[200px] w-[130px] flex-shrink-0 overflow-hidden rounded-xl shadow-lg" style={{ transform: `rotate(${(index % 3 - 1) * 5}deg) translateY(${(index % 2) * 20}px)` }}><img src={cover} alt="" className="h-full w-full object-cover" /></div>))}</div></div>
          </div>
        </section>
      </div>

      <footer className="border-t border-white/[0.06] bg-[#050508]">
        <div className="mx-auto max-w-[1400px] px-6 py-16">
          <div className="grid gap-12 md:grid-cols-[1.5fr_1fr_1fr_1fr_1fr]">
            <div><img src="/favicon.svg" alt="Verkli" className="h-9 w-auto" /><p className="mt-5 max-w-[220px] text-[14px] leading-relaxed text-white/50">Where books become momentum.</p></div>
            <div><p className="text-[11px] font-semibold uppercase tracking-wider text-white/40">VERKLI</p><ul className="mt-5 space-y-3 text-[14px] text-white/50"><li><a href="#" className="transition-colors hover:text-white">Light reader app</a></li><li><a href="#" className="transition-colors hover:text-white">Go Premium</a></li></ul></div>
            <div><p className="text-[11px] font-semibold uppercase tracking-wider text-white/40">DISCOVER</p><ul className="mt-5 space-y-3 text-[14px] text-white/50"><li><a href="#" className="transition-colors hover:text-white">Social</a></li><li><a href="#" className="transition-colors hover:text-white">Library</a></li><li><a href="#" className="transition-colors hover:text-white">Clubs</a></li></ul></div>
            <div><p className="text-[11px] font-semibold uppercase tracking-wider text-white/40">APP</p><ul className="mt-5 space-y-3 text-[14px] text-white/50"><li><a href="#" className="transition-colors hover:text-white">iOS</a></li><li><a href="#" className="transition-colors hover:text-white">Android</a></li></ul></div>
            <div><p className="text-[11px] font-semibold uppercase tracking-wider text-white/40">ABOUT</p><ul className="mt-5 space-y-3 text-[14px] text-white/50"><li><a href="#" className="transition-colors hover:text-white">About us</a></li><li><a href="#" className="transition-colors hover:text-white">Careers</a></li><li><a href="#" className="transition-colors hover:text-white">Contact</a></li></ul></div>
          </div>
          <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-white/[0.06] pt-8 text-[13px] text-white/30 md:flex-row"><div className="flex gap-6"><a href="#" className="transition-colors hover:text-white/50">Terms of Service</a><a href="#" className="transition-colors hover:text-white/50">Privacy Policy</a></div><span>© 2026 Verkli. All rights reserved.</span></div>
        </div>
      </footer>

      <style jsx>{`@keyframes scroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } } .animate-scroll { animation: scroll 30s linear infinite; }`}</style>
    </main>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================
export default function WriterPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    const getUser = async () => { const { data: { user } } = await supabase.auth.getUser(); setUser(user); setLoading(false); };
    getUser();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => { if (event === "SIGNED_OUT") setUser(null); else if (event === "SIGNED_IN" && session?.user) setUser(session.user); });
    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => { const supabase = createClient(); await supabase.auth.signOut(); setUser(null); };

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-[#050508]"><div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-[#907AFF]"></div></div>;

  return user ? <Dashboard user={user} onSignOut={handleSignOut} /> : <LandingPage />;
}
