"use client";

import { useState, useRef, useEffect, type CSSProperties } from "react";
import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import { BRAND_COLORS } from "@/lib/design/brand";
import AuthorLandingSections from "./AuthorLandingSections";
import styles from "./AuthorLandingSections.module.css";

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
    <main className={`${styles.page} author-light relative min-h-screen bg-background text-foreground transition-colors duration-300 -mt-[88px]`}>
      <div className="section-stack">
        {/* ─── Hero ─── */}
        <section
          ref={heroRef}
          onMouseMove={handleHeroMouseMove}
          onMouseLeave={handleHeroMouseLeave}
          style={heroMotionStyle}
          className="relative isolate mx-auto flex w-full max-w-[1800px] flex-col items-center overflow-hidden px-5 pb-8 pt-[140px] text-center sm:px-8 lg:px-12 lg:pt-[172px]"
        >
          {/* Layered background overlays */}
          <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
            <div className="relative h-full w-full">
              <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_30%_40%,rgba(144,122,255,0.06),transparent_60%),radial-gradient(circle_at_70%_60%,rgba(226,158,213,0.04),transparent_50%)]" />
              <div className="absolute inset-0 z-10 bg-white/[0.82] dark:bg-[#050508]/80" />
              <div className="absolute inset-0 z-11 bg-gradient-to-b from-background via-transparent to-background" />
              <div className="absolute z-12 h-[560px] w-[560px] rounded-full blur-[140px] transition-all duration-[1200ms] ease-out" style={{ background: BRAND_COLORS.violet, opacity: 0.15, left: "calc(var(--hero-mouse-x)*100% - 30%)", top: "calc(var(--hero-mouse-y)*100% - 30%)" }} />
              <div className="absolute z-12 h-[380px] w-[380px] rounded-full blur-[120px] transition-all duration-[1600ms] ease-out" style={{ background: BRAND_COLORS.rose, opacity: 0.10, left: "calc((1 - var(--hero-mouse-x))*100% - 20%)", top: "calc(var(--hero-mouse-y)*100% - 20%)" }} />
              <div className="absolute z-12 h-[280px] w-[280px] rounded-full blur-[96px] transition-all duration-700 ease-out" style={{ background: BRAND_COLORS.amber, opacity: 0.08, left: "calc(var(--hero-mouse-x)*70% + 15%)", top: "calc((1 - var(--hero-mouse-y))*60% + 20%)" }} />
            </div>
          </div>

          <div className="mx-auto grid w-full max-w-[1440px] items-center gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-12">
            <div className="flex min-w-0 flex-col items-center text-center lg:items-start lg:text-left">
              {/* Badge */}
              <div className="hero-animate-down mb-7 inline-flex items-center gap-2 rounded-full border border-black/[0.08] bg-white/80 px-4 py-1.5 backdrop-blur-xl dark:border-white/[0.12] dark:bg-white/[0.04]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#907AFF]" />
                <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-slate-600 dark:text-white/60">Your AI creative studio</span>
              </div>

              {/* Headline */}
              <h1 className="hero-animate max-w-full text-[clamp(34px,8.6vw,68px)] font-semibold leading-[1.04] tracking-[-0.055em] text-slate-900 dark:text-white lg:text-[clamp(46px,4.5vw,76px)]" style={{ animationDelay: "180ms", fontFamily: "var(--font-montserrat-alternates), sans-serif" }}>
                Your story.<br />
                <span className="bg-[linear-gradient(110deg,#907AFF_0%,#E29ED5_55%,#FCC997_100%)] bg-clip-text text-transparent">
                  Supercharged.
                </span>
              </h1>

              {/* Subtitle */}
              <p className="hero-animate mt-6 max-w-[500px] text-[clamp(16px,1.2vw,19px)] leading-[1.65] text-slate-500 dark:text-white/50" style={{ animationDelay: "340ms" }}>
                Write, translate, create audiobooks, and publish.
                Your imagination, connected in one AI workspace.
              </p>

              {/* CTAs */}
              <div className="hero-animate mt-8 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row lg:flex-wrap lg:justify-start" style={{ animationDelay: "500ms" }}>
                <Link href="/author/signup" className="btn-primary w-full rounded-full px-8 py-3.5 text-center text-[15px] shadow-[0_18px_40px_rgba(111,88,223,0.32)] sm:w-auto sm:min-w-[192px]">
                  Start for free
                </Link>
                <Link href="/how-it-works" className="btn-secondary w-full rounded-full border-black/10 bg-white/80 px-7 py-3.5 text-center text-[15px] sm:w-auto sm:min-w-[178px]">
                  See how it works
                </Link>
              </div>

              <p className="hero-animate mt-6 text-[13px] text-slate-500 dark:text-white/60" style={{ animationDelay: "600ms" }}>Your ideas. Your voice. A whole new dimension.</p>
            </div>

            <figure className="min-w-0" aria-label="Verkli Studio product concept">
              <div className="overflow-hidden rounded-[22px] border border-black/10 bg-[#0b0b10] shadow-[0_28px_70px_-26px_rgba(36,24,67,0.4)] sm:rounded-[28px] dark:border-white/15">
                <Image
                  src="/images/verkli-studio-mockup-v1.png"
                  alt="Product concept showing Verkli’s writing studio, English-to-Spanish translation and audiobook player."
                  width={1536}
                  height={1024}
                  sizes="(max-width: 639px) calc(100vw - 40px), (max-width: 1023px) calc(100vw - 64px), (max-width: 1535px) calc(60vw - 86px), 836px"
                  quality={90}
                  className="h-auto w-full"
                  priority
                />
              </div>
              <figcaption className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-1 text-left text-[11px] text-slate-500 dark:text-white/60 sm:text-xs">
                <span className="inline-flex items-center gap-2 font-medium text-slate-700 dark:text-white/80"><Image src="/favi.svg" alt="" width={23} height={21} />Verkli Studio</span>
                <span>Product concept · Example manuscript</span>
              </figcaption>
            </figure>
          </div>
        </section>

        <AuthorLandingSections />

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

  return user ? <AuthorDashboard /> : <LandingPage />;
}
