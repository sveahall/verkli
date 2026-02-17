"use client";

import { useState, useRef, useEffect, type CSSProperties } from "react";
import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";
import LazySection from "@/components/LazySection";
import BrandGradientText from "@/components/ui/brand-gradient-text";
import type { User } from "@supabase/supabase-js";
import { BRAND_COLORS } from "@/lib/design/brand";

const gridImages = [
  "https://images.unsplash.com/photo-1723403804231-f4e9b515fe9d?auto=format&fit=crop&w=640&q=60",
  "https://images.unsplash.com/photo-1748370987492-eb390a61dcda?auto=format&fit=crop&w=640&q=60",
];
const gridRows = 9;
const gridCols = 8;
const gridItems = Array.from({ length: gridRows * gridCols }, (_, i) => gridImages[i % gridImages.length]);

const GridMotion = dynamic(() => import("@/components/GridMotion"), { ssr: false });
const TestimonialSection = dynamic(() => import("@/components/TestimonialSection"), { ssr: false });
const StatsSection = dynamic(() => import("@/components/StatsSection"), { ssr: false });
const FeaturesSection = dynamic(() => import("@/components/FeaturesSection"), { ssr: false });
const InteractiveTestimonialSection = dynamic(
  () => import("@/features/author/InteractiveTestimonialSection"),
  { ssr: false }
);
const AuthorDashboard = dynamic(() => import("@/features/author/AuthorDashboard"), { ssr: false });
// ============================================
// LANDING PAGE (for non-authenticated users)
// ============================================
function LandingPage() {
  const heroRef = useRef<HTMLElement>(null);
  const heroPointerRef = useRef({ x: 0.5, y: 0.5 });
  const heroPointerRafRef = useRef<number>(0);

  const handleHeroMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    if (!heroRef.current) return;
    const rect = heroRef.current.getBoundingClientRect();
    heroPointerRef.current = {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
    if (heroPointerRafRef.current) return;
    heroPointerRafRef.current = requestAnimationFrame(() => {
      heroPointerRafRef.current = 0;
      const node = heroRef.current;
      if (!node) return;
      node.style.setProperty("--hero-mouse-x", heroPointerRef.current.x.toFixed(4));
      node.style.setProperty("--hero-mouse-y", heroPointerRef.current.y.toFixed(4));
    });
  };

  const handleHeroMouseLeave = () => {
    const node = heroRef.current;
    if (!node) return;
    heroPointerRef.current = { x: 0.5, y: 0.5 };
    node.style.setProperty("--hero-mouse-x", "0.5");
    node.style.setProperty("--hero-mouse-y", "0.5");
  };

  useEffect(() => {
    return () => {
      if (heroPointerRafRef.current) {
        cancelAnimationFrame(heroPointerRafRef.current);
      }
    };
  }, []);

  const heroMotionStyle = {
    "--hero-mouse-x": "0.5",
    "--hero-mouse-y": "0.5",
  } as CSSProperties;

  return (
    <main className="author-light relative min-h-screen bg-background text-foreground transition-colors duration-300 -mt-[88px]">
      <div className="section-stack">
        {/* ─── Hero ─── */}
        <section
          ref={heroRef}
          onMouseMove={handleHeroMouseMove}
          onMouseLeave={handleHeroMouseLeave}
          style={heroMotionStyle}
          className="relative isolate mx-auto flex min-h-screen w-full max-w-[1800px] flex-col items-center justify-center overflow-hidden px-6 pb-32 pt-[88px] text-center md:pb-44"
        >
          {/* GridMotion texture + layered overlays */}
          <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
            <div className="relative h-full w-full">
              <div className="absolute inset-0 z-0">
                <GridMotion items={gridItems} gradientColor="black" rows={gridRows} cols={gridCols} />
              </div>
              {/* White/dark wash to soften grid */}
              <div className="absolute inset-0 z-10 bg-white/[0.82] dark:bg-[#050508]/80" />
              {/* Top + bottom fade to page bg */}
              <div className="absolute inset-0 z-11 bg-gradient-to-b from-background via-transparent to-background" />
              {/* Mouse-reactive colour orbs */}
              <div className="absolute z-12 h-[560px] w-[560px] rounded-full blur-[140px] transition-all duration-[1200ms] ease-out" style={{ background: BRAND_COLORS.violet, opacity: 0.15, left: "calc(var(--hero-mouse-x)*100% - 30%)", top: "calc(var(--hero-mouse-y)*100% - 30%)" }} />
              <div className="absolute z-12 h-[380px] w-[380px] rounded-full blur-[120px] transition-all duration-[1600ms] ease-out" style={{ background: BRAND_COLORS.rose, opacity: 0.10, left: "calc((1 - var(--hero-mouse-x))*100% - 20%)", top: "calc(var(--hero-mouse-y)*100% - 20%)" }} />
              <div className="absolute z-12 h-[280px] w-[280px] rounded-full blur-[96px] transition-all duration-700 ease-out" style={{ background: BRAND_COLORS.amber, opacity: 0.08, left: "calc(var(--hero-mouse-x)*70% + 15%)", top: "calc((1 - var(--hero-mouse-y))*60% + 20%)" }} />
            </div>
          </div>

          {/* Badge */}
          <div className="mb-8 inline-flex items-center gap-2.5 rounded-full border border-black/[0.06] bg-white/70 px-5 py-2 shadow-[0_1px_2px_rgba(0,0,0,0.04)] backdrop-blur-xl dark:border-white/[0.08] dark:bg-white/[0.04] dark:shadow-none">
            <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#907AFF]" />
            <span className="text-[13px] font-medium text-slate-600 dark:text-white/60">Now in public beta</span>
          </div>

          {/* Headline */}
          <h1 className="max-w-[860px] text-[clamp(42px,7.5vw,76px)] font-regular leading-[1.08] tracking-[-0.04em] text-slate-900 dark:text-white">
            Write once. <br />
            <BrandGradientText
              className="font-semibold"
              colors={["#907AFF", "#c4a0e8", "#E29ED5"]}
            >
              Show up everywhere.
            </BrandGradientText>
          </h1>

          {/* Sub */}
          <p className="mt-7 max-w-[520px] text-[clamp(16px,1.5vw,19px)] leading-[1.6] text-slate-500 dark:text-white/50">
            Turn your books into content, connect with readers, and build sustainable revenue — all from one platform.
          </p>

          {/* CTAs */}
          <div className="mt-10 flex items-center gap-3">
            <Link href="/author/signup" className="btn-primary min-w-[170px] text-[15px]">
              Get started free
            </Link>
            <Link href="/author/signin" className="btn-secondary min-w-[120px] text-[15px]">
              Sign in
            </Link>
          </div>

          {/* Reader link */}
          <p className="mt-16 text-[13px] text-slate-400 dark:text-white/30">
            Looking for stories?{" "}
            <Link href="/reader" className="font-medium text-slate-500 underline decoration-slate-300 underline-offset-[3px] transition hover:text-slate-700 hover:decoration-slate-400 dark:text-white/45 dark:decoration-white/15 dark:hover:text-white/65">
              Go to reader →
            </Link>
          </p>
        </section>

        {/* ─── Bento Grid ─── */}
        <section className="relative mx-auto w-full max-w-[1200px] px-6">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 md:gap-4">
            {/* ── Main feature card (2-col) ── */}
            <div className="group relative col-span-full overflow-hidden rounded-[28px] border border-black/[0.04] bg-gradient-to-br from-[#907AFF]/[0.14] via-[#E29ED5]/[0.08] to-[#FCC997]/[0.06] p-10 shadow-[0_2px_40px_rgba(144,122,255,0.06)] lg:col-span-2 lg:p-14">
              <div className="pointer-events-none absolute -right-24 -top-24 h-[420px] w-[420px] rounded-full bg-[#907AFF]/[0.18] blur-[100px] transition-transform duration-[1200ms] group-hover:translate-x-8 group-hover:translate-y-4" />
              <div className="pointer-events-none absolute -bottom-16 -left-16 h-[300px] w-[300px] rounded-full bg-[#E29ED5]/[0.12] blur-[80px]" />
              <div className="relative max-w-[480px]">
                <p className="mb-4 text-[13px] font-medium uppercase tracking-[0.15em] text-[#907AFF]/80 dark:text-[#907AFF]/60">One platform</p>
                <h2 className="text-[clamp(30px,3.5vw,44px)] font-bold leading-[1.1] tracking-[-0.03em] text-slate-900 dark:text-white">
                  Zero friction{" "}
                  <BrandGradientText>book marketing.</BrandGradientText>
                </h2>
                <p className="mt-5 max-w-[400px] text-[16px] leading-[1.7] text-slate-500 dark:text-white/50">Turn your book into structured content that publishes, adapts, and scales — without the busywork.</p>
                <div className="mt-8">
                  <Link href="/author/signup" className="btn-primary text-[15px]">Start for free</Link>
                </div>
              </div>
            </div>

            {/* ── Rating card ── */}
            <div className="group relative overflow-hidden rounded-[28px] border border-black/[0.04] bg-white/60 p-8 backdrop-blur-sm transition-shadow duration-500 hover:shadow-[0_8px_30px_rgba(252,201,151,0.1)] dark:border-white/[0.06] dark:bg-white/[0.03]">
              <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-[#FCC997]/20 blur-3xl opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
              <div className="relative flex h-full flex-col justify-between gap-6">
                <div>
                  <div className="mb-3 flex items-center gap-1">
                    {[1,2,3,4,5].map((i) => (
                      <svg key={i} className="h-[18px] w-[18px] text-[#FCC997] drop-shadow-[0_1px_2px_rgba(252,201,151,0.4)]" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                    ))}
                  </div>
                  <p className="text-[44px] font-bold tracking-[-0.03em] text-slate-900 dark:text-white">4.9<span className="text-[24px] font-semibold text-slate-400 dark:text-white/30">/5</span></p>
                  <p className="mt-1 text-[14px] text-slate-500 dark:text-white/40">Average rating from authors</p>
                </div>
                <div className="flex -space-x-2">
                  {["https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&h=80&fit=crop&crop=face","https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=80&fit=crop&crop=face","https://images.unsplash.com/photo-1517841905240-472988babdf9?w=80&h=80&fit=crop&crop=face","https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=80&h=80&fit=crop&crop=face"].map((src, i) => (
                    <Image key={i} src={src} alt="" width={36} height={36} sizes="36px" className="h-9 w-9 rounded-full border-2 border-white object-cover shadow-sm transition-transform duration-300 hover:z-10 hover:scale-110 dark:border-[#111]" />
                  ))}
                  <div className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-[#907AFF]/10 text-[11px] font-bold text-[#907AFF] dark:border-[#111]">+2k</div>
                </div>
              </div>
            </div>

            {/* ── Three highlight cards ── */}
            {[
              { title: "No credit card", desc: "Start free, upgrade when ready", color: "#907AFF", icon: "M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" },
              { title: "2 min setup", desc: "Go live in minutes, not days", color: "#E29ED5", icon: "M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" },
              { title: "10+ platforms", desc: "Publish everywhere at once", color: "#FCC997", icon: "M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" },
            ].map((item) => (
              <div key={item.title} className="group relative overflow-hidden rounded-[22px] border border-black/[0.04] bg-white/50 p-6 backdrop-blur-sm transition-all duration-500 hover:border-black/[0.08] hover:shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:border-white/[0.06] dark:bg-white/[0.02] dark:hover:border-white/[0.10]">
                <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full blur-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-40" style={{ background: item.color }} />
                <div className="relative flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: `${item.color}12` }}>
                    <svg className="h-[18px] w-[18px]" style={{ color: item.color }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d={item.icon} /></svg>
                  </div>
                  <div>
                    <p className="text-[16px] font-semibold text-slate-900 dark:text-white">{item.title}</p>
                    <p className="mt-0.5 text-[14px] leading-snug text-slate-500 dark:text-white/40">{item.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <LazySection className="landing-deferred" minHeight={520}>
          <TestimonialSection />
        </LazySection>
        <LazySection className="landing-deferred" minHeight={420}>
          <StatsSection />
        </LazySection>
        <LazySection className="landing-deferred" minHeight={640}>
          <FeaturesSection />
        </LazySection>
        <LazySection className="landing-deferred" minHeight={520}>
          <InteractiveTestimonialSection />
        </LazySection>

        {/* ─── Why Verkli ─── */}
        <LazySection className="landing-deferred" minHeight={860}>
          <section className="mx-auto w-full max-w-[1200px] px-6 py-28">
            <div className="grid gap-14 lg:grid-cols-[1fr_1.3fr] lg:items-start">
              <div className="lg:sticky lg:top-32">
                <p className="text-[13px] font-medium uppercase tracking-[0.15em] text-[#907AFF]">Why Verkli</p>
                <h2 className="mt-5 text-[clamp(28px,3.5vw,42px)] font-bold leading-[1.1] tracking-[-0.03em] text-slate-900 dark:text-white">
                  Everything you need to{" "}
                  <BrandGradientText>grow your audience.</BrandGradientText>
                </h2>
                <p className="mt-5 max-w-[380px] text-[16px] leading-[1.7] text-slate-500 dark:text-white/45">Simple tools that help you reach readers — without the complexity.</p>
                <div className="mt-8">
                  <Link href="/author/signup" className="btn-secondary text-[15px]">Explore features</Link>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  { title: "Get discovered", description: "Turn your book into scroll-stopping content for TikTok, Instagram, and beyond.", color: BRAND_COLORS.violet, icon: "M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" },
                  { title: "Grow your audience", description: "Reach readers before they buy. Build momentum with content that connects.", color: BRAND_COLORS.rose, icon: "M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" },
                  { title: "Automate marketing", description: "AI-generated hooks, scripts, and captions — without daily effort.", color: BRAND_COLORS.amber, icon: "M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" },
                  { title: "Focus on writing", description: "Upload a chapter, get content. No complex tools. No learning curve.", color: BRAND_COLORS.amberSoft, icon: "M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" },
                ].map((item) => (
                  <div key={item.title} className="group relative overflow-hidden rounded-[22px] border border-black/[0.04] bg-white/50 p-7 backdrop-blur-sm transition-all duration-500 hover:border-black/[0.10] hover:shadow-[0_8px_30px_rgba(0,0,0,0.04)] dark:border-white/[0.06] dark:bg-white/[0.02] dark:hover:border-white/[0.12]">
                    <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full blur-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-40" style={{ background: item.color }} />
                    <div className="relative">
                      <div className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-105" style={{ background: `${item.color}12` }}>
                        <svg className="h-5 w-5" style={{ color: item.color }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d={item.icon} /></svg>
                      </div>
                      <h3 className="text-[16px] font-semibold text-slate-900 dark:text-white">{item.title}</h3>
                      <p className="mt-2 text-[14px] leading-[1.65] text-slate-500 dark:text-white/40">{item.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </LazySection>

        {/* ─── CTA ─── */}
        <LazySection className="landing-deferred" minHeight={760}>
          <section className="relative mx-auto w-full max-w-[1200px] px-6 py-28">
            <div className="group relative overflow-hidden rounded-[32px] border border-black/[0.04] bg-gradient-to-br from-[#907AFF]/[0.12] via-[#E29ED5]/[0.07] to-[#FCC997]/[0.05] shadow-[0_2px_40px_rgba(144,122,255,0.06)] dark:border-white/[0.06]">
            {/* Ambient glows */}
            <div className="pointer-events-none absolute -left-32 -top-32 h-[400px] w-[400px] rounded-full bg-[#907AFF]/20 blur-[120px] transition-transform duration-[1500ms] group-hover:translate-x-10 group-hover:translate-y-8" />
            <div className="pointer-events-none absolute -bottom-20 -right-20 h-[300px] w-[300px] rounded-full bg-[#E29ED5]/15 blur-[100px] transition-transform duration-[1500ms] group-hover:-translate-x-6" />

            <div className="relative grid items-center gap-10 p-10 md:p-16 lg:grid-cols-[1.4fr_1fr] lg:gap-16">
              {/* Left — copy */}
              <div>
                <p className="text-[13px] font-medium uppercase tracking-[0.15em] text-slate-500 dark:text-white/40">Get started today</p>
                <h2 className="mt-5 text-[clamp(28px,3.5vw,42px)] font-bold leading-[1.1] tracking-[-0.03em] text-slate-900 dark:text-white">
                  Ready to reach more readers?
                </h2>
                <p className="mt-5 max-w-[400px] text-[16px] leading-[1.7] text-slate-500 dark:text-white/50">Join thousands of authors turning their books into content that reaches readers everywhere.</p>
                <div className="mt-10 flex flex-wrap items-center gap-4">
                  <Link href="/author/signup" className="btn-primary text-[15px]">Start for free</Link>
                  <a href="#" className="flex items-center gap-1.5 text-[15px] font-medium text-slate-500 transition-colors hover:text-slate-800 dark:text-white/45 dark:hover:text-white/70">
                    Schedule a demo
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                  </a>
                </div>
              </div>

              {/* Right — social proof stack */}
              <div className="flex flex-col gap-4">
                <div className="rounded-2xl border border-black/[0.04] bg-white/70 p-6 backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.03]">
                  <div className="flex items-center gap-1">
                    {[1,2,3,4,5].map((i) => (
                      <svg key={i} className="h-[18px] w-[18px] text-[#FCC997] drop-shadow-[0_1px_2px_rgba(252,201,151,0.4)]" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                    ))}
                  </div>
                  <p className="mt-2 text-[24px] font-bold tracking-tight text-slate-900 dark:text-white">4.9 out of 5</p>
                  <p className="mt-0.5 text-[13px] text-slate-500 dark:text-white/40">Based on 2,000+ reviews</p>
                </div>
                <div className="rounded-2xl border border-black/[0.04] bg-white/70 p-6 backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.03]">
                  <div className="flex -space-x-2.5">
                    {["https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&h=80&fit=crop&crop=face","https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=80&fit=crop&crop=face","https://images.unsplash.com/photo-1517841905240-472988babdf9?w=80&h=80&fit=crop&crop=face","https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=80&h=80&fit=crop&crop=face"].map((src, i) => (
                      <Image key={i} src={src} alt="" width={40} height={40} sizes="40px" className="h-10 w-10 rounded-full border-2 border-white object-cover shadow-sm dark:border-[#111]" />
                    ))}
                    <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-white bg-[#907AFF]/10 text-[11px] font-bold text-[#907AFF] dark:border-[#111]">+2k</div>
                  </div>
                  <p className="mt-3 text-[15px] leading-[1.55] text-slate-600 dark:text-white/55">&quot;Verkli helped me turn one story into content that reached millions.&quot;</p>
                  <p className="mt-2 text-[13px] text-slate-400 dark:text-white/30">— Emma Richardson, NYT Bestseller</p>
                </div>
              </div>
            </div>
            </div>
          </section>
        </LazySection>

        {/* Footer rendered globally in layout */}
      </div>
    </main>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================
export default function AuthorPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    const getUser = async () => { const { data: { user } } = await supabase.auth.getUser(); setUser(user); setLoading(false); };
    getUser();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => { if (event === "SIGNED_OUT") setUser(null); else if (event === "SIGNED_IN" && session?.user) setUser(session.user); });
    return () => subscription.unsubscribe();
  }, []);

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-[#050508]"><div className="h-8 w-8 animate-spin rounded-full border-2 border-black/20 border-t-[#907AFF] dark:border-white/20"></div></div>;

  return user ? <AuthorDashboard user={user} /> : <LandingPage />;
}
