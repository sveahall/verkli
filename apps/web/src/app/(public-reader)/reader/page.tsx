"use client";

import { useState, useRef, useEffect, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/* ── Data ── */

const valueBenefits = [
  {
    title: "Discover stories you actually care about",
    description:
      "Find work that resonates. No endless scrolling—curated paths to stories that matter to you.",
    icon: "M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z",
    color: "#907AFF",
  },
  {
    title: "Follow authors directly",
    description:
      "Stay close to the people who write. Get new chapters and updates without algorithms in the way.",
    icon: "M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998-0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z",
    color: "#E29ED5",
  },
  {
    title: "Read across genres in one place",
    description:
      "Fiction, essays, serials—all in a single home. Switch moods, not apps.",
    icon: "M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25",
    color: "#FCC997",
  },
  {
    title: "Support authors you love",
    description:
      "Your attention and support go straight to creators. Read knowing you're part of their journey.",
    icon: "M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z",
    color: "#FEE9A3",
  },
];

const howItWorksSteps = [
  {
    step: 1,
    title: "Discover stories",
    description:
      "Browse by mood, genre, or author. Find something that pulls you in.",
    color: "#907AFF",
  },
  {
    step: 2,
    title: "Follow authors or series",
    description: "Stay updated on what you care about. No feed noise.",
    color: "#E29ED5",
  },
  {
    step: 3,
    title: "Read and engage",
    description:
      "Dive in. Comment, save, and return whenever you're ready.",
    color: "#FCC997",
  },
];

const whyDifferent = [
  {
    title: "Direct connection to authors",
    text: "Stories and updates come from the people who write them, not from an algorithm.",
    icon: "M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z",
    color: "#907AFF",
  },
  {
    title: "Less noise, more quality",
    text: "A place built for reading, not for infinite scroll or engagement tricks.",
    icon: "M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z",
    color: "#E29ED5",
  },
  {
    title: "Built for long-form storytelling",
    text: "Serials, novels, and essays get the space they need—no squeezing into feeds.",
    icon: "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z",
    color: "#FCC997",
  },
  {
    title: "Reader-first platform",
    text: "Every decision starts with how it feels to read and discover, not to advertise.",
    icon: "M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z",
    color: "#FEE9A3",
  },
];

/* ── Component ── */

export default function ReaderLanding() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const check = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setAuthChecked(true);
        return;
      }
      const role =
        user.user_metadata?.active_role ?? user.user_metadata?.role;
      if (role === "reader") {
        router.replace("/reader/home");
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();
      if (profile?.role === "reader") {
        router.replace("/reader/home");
        return;
      }
      setAuthChecked(true);
    };
    check();
  }, [router]);

  /* ── Hero mouse-tracking (CSS custom props for perf) ── */
  const heroRef = useRef<HTMLElement>(null);
  const heroPointerRef = useRef({ x: 0.5, y: 0.5 });
  const heroRafRef = useRef<number>(0);

  const handleHeroMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    if (!heroRef.current) return;
    const rect = heroRef.current.getBoundingClientRect();
    heroPointerRef.current = {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
    if (heroRafRef.current) return;
    heroRafRef.current = requestAnimationFrame(() => {
      heroRafRef.current = 0;
      const node = heroRef.current;
      if (!node) return;
      node.style.setProperty(
        "--hero-mouse-x",
        heroPointerRef.current.x.toFixed(4),
      );
      node.style.setProperty(
        "--hero-mouse-y",
        heroPointerRef.current.y.toFixed(4),
      );
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
      if (heroRafRef.current) cancelAnimationFrame(heroRafRef.current);
    };
  }, []);

  const heroMotionStyle = {
    "--hero-mouse-x": "0.5",
    "--hero-mouse-y": "0.5",
  } as CSSProperties;

  /* ── Loading gate ── */
  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white dark:bg-[#050508]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-[#907AFF] dark:border-white/20 dark:border-t-[#907AFF]" />
      </div>
    );
  }

  return (
    <main className="relative min-h-screen bg-background text-foreground">
      {/* ─── Hero ─── */}
      <section
        ref={heroRef}
        onMouseMove={handleHeroMouseMove}
        onMouseLeave={handleHeroMouseLeave}
        style={heroMotionStyle}
        className="relative isolate mx-auto flex min-h-screen w-full max-w-[1800px] flex-col items-center justify-center overflow-hidden px-6 pb-32 pt-[88px] text-center md:pb-44"
      >
        {/* ── Dramatic gradient orb background — reader hero ── */}
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          {/* Deep base */}
          <div className="absolute inset-0 bg-[#faf8ff] dark:bg-[#06050e]" />

          {/* ★ Central rotating orb — the hero visual */}
          <div className="absolute left-1/2 top-[42%] h-[min(700px,90vw)] w-[min(700px,90vw)] -translate-x-1/2 -translate-y-1/2">
            {/* Outer halo glow */}
            <div className="absolute inset-[-30%] animate-[reader-pulse_8s_ease-in-out_infinite] rounded-full bg-[#907AFF]/20 blur-[120px] dark:bg-[#907AFF]/15" />
            {/* Rotating conic gradient core */}
            <div className="absolute inset-0 animate-[reader-spin_20s_linear_infinite] rounded-full blur-[80px]" style={{ background: "conic-gradient(from 0deg, #907AFF, #7c5cff, #c4a0e8, #E29ED5, #f0b4d4, #FCC997, #ffd4a8, #c4a0e8, #907AFF)" }} />
            {/* Inner bright core */}
            <div className="absolute inset-[20%] animate-[reader-spin_14s_linear_infinite_reverse] rounded-full blur-[60px] opacity-70 dark:opacity-50" style={{ background: "conic-gradient(from 180deg, #a78bfa, #E29ED5, #fbbf24, #907AFF, #a78bfa)" }} />
            {/* White-hot center for depth */}
            <div className="absolute inset-[35%] rounded-full bg-white/50 blur-[50px] dark:bg-white/10" />
          </div>

          {/* Satellite accent orbs */}
          <div className="absolute left-[8%] top-[20%] h-[250px] w-[250px] animate-[reader-aurora-1_16s_ease-in-out_infinite] rounded-full bg-[#907AFF]/30 blur-[80px] dark:bg-[#907AFF]/20" />
          <div className="absolute right-[10%] top-[25%] h-[200px] w-[200px] animate-[reader-aurora-3_20s_ease-in-out_infinite] rounded-full bg-[#E29ED5]/25 blur-[70px] dark:bg-[#E29ED5]/15" />
          <div className="absolute bottom-[15%] left-[15%] h-[180px] w-[180px] animate-[reader-aurora-2_18s_ease-in-out_infinite] rounded-full bg-[#FCC997]/30 blur-[60px] dark:bg-[#FCC997]/18" />
          <div className="absolute bottom-[20%] right-[8%] h-[220px] w-[220px] animate-[reader-aurora-4_22s_ease-in-out_infinite] rounded-full bg-[#c4a0e8]/25 blur-[70px] dark:bg-[#c4a0e8]/15" />

          {/* Mouse-reactive spotlight */}
          <div className="absolute inset-0 transition-all duration-[1000ms] ease-out" style={{ background: "radial-gradient(600px 500px at calc(var(--hero-mouse-x)*100%) calc(var(--hero-mouse-y)*100%), rgba(144,122,255,0.15) 0%, transparent 50%)" }} />

          {/* Grain */}
          <div className="absolute inset-0 opacity-[0.035] dark:opacity-[0.05]" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")" }} />

          {/* Top + bottom fade */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#faf8ff]/70 via-transparent to-background dark:from-[#06050e]/70" />
        </div>

        {/* Headline */}
        <h1 className="max-w-[860px] text-[clamp(42px,7.5vw,76px)] font-semibold leading-[1.08] tracking-[-0.04em] text-slate-900 dark:text-white">
          Stories that find you. <br />
          <span className="bg-gradient-to-r from-gray-500 to-gray-900 bg-clip-text text-transparent">
            Read without the noise.
          </span>
        </h1>

        {/* Sub */}
        <p className="mt-7 max-w-[520px] text-[clamp(16px,1.5vw,19px)] leading-[1.6] text-slate-500 dark:text-white/50">
          Discover, follow, and immerse yourself. Verkli is where readers and authors meet — calm, human, and built for the stories that move you.
        </p>

        {/* CTAs */}
        <div className="mt-10 flex items-center gap-3">
          <Link href="/reader/discover" className="btn-primary min-w-[170px] text-[15px]">Explore stories</Link>
          <Link href="/reader/signup" className="btn-secondary min-w-[120px] text-[15px]">Join Verkli</Link>
        </div>

        {/* Author link */}
        <p className="mt-16 text-[13px] text-slate-400 dark:text-white/30">
          Are you an author?{" "}
          <Link href="/author" className="font-medium text-slate-500 underline decoration-slate-300 underline-offset-[3px] transition hover:text-slate-700 hover:decoration-slate-400 dark:text-white/45 dark:decoration-white/15 dark:hover:text-white/65">
            Go to authors page →
          </Link>
        </p>
      </section>

      {/* ─── Value props ─── */}
      <section className="mx-auto w-full max-w-[1200px] px-6 py-20" aria-labelledby="value-heading">
        <div className="text-center">
          <p className="text-[13px] font-medium uppercase tracking-[0.15em] text-[#907AFF]">Why Verkli</p>
          <h2 id="value-heading" className="mx-auto mt-4 max-w-[640px] text-[clamp(28px,4vw,48px)] font-semibold leading-[1.1] tracking-[-0.025em] text-slate-900 dark:text-white">
            A place to{" "}
            <span className="bg-gradient-to-r from-[#907AFF] via-[#E29ED5] to-[#FCC997] bg-clip-text text-transparent">discover</span>{" "}
            and stay close to what you love
          </h2>
          <p className="mx-auto mt-5 max-w-[480px] text-[16px] leading-[1.7] text-slate-500 dark:text-white/50">Built for readers who want more than a feed.</p>
        </div>

        <div className="mt-14 grid gap-4 sm:grid-cols-2">
          {valueBenefits.map((item) => (
            <div key={item.title} className="group relative overflow-hidden rounded-[24px] border border-black/[0.06] bg-gradient-to-br from-black/[0.03] to-transparent p-8 transition-all duration-500 hover:border-black/[0.12] hover:shadow-[0_4px_24px_rgba(0,0,0,0.04)] dark:border-white/[0.06] dark:from-white/[0.03] dark:hover:border-white/[0.12]">
              <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full blur-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-50" style={{ background: item.color }} />
              <div className="relative">
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl transition-transform duration-500 group-hover:scale-110" style={{ background: `linear-gradient(135deg, ${item.color}25, ${item.color}10)` }}>
                  <svg className="h-5 w-5" style={{ color: item.color }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                  </svg>
                </div>
                <h3 className="text-[17px] font-semibold text-slate-900 dark:text-white">{item.title}</h3>
                <p className="mt-2 text-[15px] leading-[1.65] text-slate-500 dark:text-white/50">{item.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── How it works ─── */}
      <section className="mx-auto w-full max-w-[1200px] px-6 py-20" aria-labelledby="how-heading">
        <div className="text-center">
          <p className="text-[13px] font-medium uppercase tracking-[0.15em] text-[#907AFF]">How it works</p>
          <h2 id="how-heading" className="mx-auto mt-4 max-w-[640px] text-[clamp(28px,4vw,48px)] font-semibold leading-[1.1] tracking-[-0.025em] text-slate-900 dark:text-white">
            Simple. No clutter.
          </h2>
          <p className="mx-auto mt-5 max-w-[480px] text-[16px] leading-[1.7] text-slate-500 dark:text-white/50">Three steps to your next favourite story.</p>
        </div>

        <div className="mt-14 grid gap-4 sm:grid-cols-3">
          {howItWorksSteps.map((item) => (
            <div key={item.step} className="group relative overflow-hidden rounded-[24px] border border-black/[0.06] bg-gradient-to-br from-black/[0.03] to-transparent p-8 transition-all duration-500 hover:border-black/[0.12] hover:shadow-[0_4px_24px_rgba(0,0,0,0.04)] dark:border-white/[0.06] dark:from-white/[0.03] dark:hover:border-white/[0.12]">
              <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full blur-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-50" style={{ background: item.color }} />
              <div className="relative">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[14px] font-semibold text-white" style={{ background: item.color }}>{item.step}</span>
                <h3 className="mt-5 text-[17px] font-semibold text-slate-900 dark:text-white">{item.title}</h3>
                <p className="mt-2 text-[15px] leading-[1.65] text-slate-500 dark:text-white/50">{item.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Why Verkli is different ─── */}
      <section className="mx-auto w-full max-w-[1200px] px-6 py-20" aria-labelledby="different-heading">
        <div className="text-center">
          <p className="text-[13px] font-medium uppercase tracking-[0.15em] text-[#907AFF]">What makes us different</p>
          <h2 id="different-heading" className="mx-auto mt-4 max-w-[640px] text-[clamp(28px,4vw,48px)] font-semibold leading-[1.1] tracking-[-0.025em] text-slate-900 dark:text-white">
            Why Verkli is{" "}
            <span className="bg-gradient-to-r from-[#907AFF] via-[#E29ED5] to-[#FCC997] bg-clip-text text-transparent">different</span>
          </h2>
          <p className="mx-auto mt-5 max-w-[480px] text-[16px] leading-[1.7] text-slate-500 dark:text-white/50">Not just another reading app.</p>
        </div>

        <div className="mt-14 grid gap-4 sm:grid-cols-2">
          {whyDifferent.map((item) => (
            <div key={item.title} className="group relative overflow-hidden rounded-[24px] border border-black/[0.06] bg-gradient-to-br from-black/[0.03] to-transparent p-8 transition-all duration-500 hover:border-black/[0.12] hover:shadow-[0_4px_24px_rgba(0,0,0,0.04)] dark:border-white/[0.06] dark:from-white/[0.03] dark:hover:border-white/[0.12]">
              <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full blur-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-50" style={{ background: item.color }} />
              <div className="relative">
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl transition-transform duration-500 group-hover:scale-110" style={{ background: `linear-gradient(135deg, ${item.color}25, ${item.color}10)` }}>
                  <svg className="h-5 w-5" style={{ color: item.color }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                  </svg>
                </div>
                <h3 className="text-[17px] font-semibold text-slate-900 dark:text-white">{item.title}</h3>
                <p className="mt-2 text-[15px] leading-[1.65] text-slate-500 dark:text-white/50">{item.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className="mx-auto w-full max-w-[1200px] px-6 py-24" aria-labelledby="cta-heading">
        <div className="group relative overflow-hidden rounded-[40px] bg-gradient-to-br from-[#907AFF]/20 via-[#E29ED5]/12 to-[#FCC997]/10 px-8 py-20 text-center sm:px-16 sm:py-28">
          <div className="pointer-events-none absolute -left-20 -top-20 h-[350px] w-[350px] rounded-full bg-[#907AFF]/25 blur-[100px] transition-transform duration-1000 group-hover:translate-x-10 group-hover:translate-y-10" />
          <div className="pointer-events-none absolute -bottom-10 -right-10 h-[250px] w-[250px] rounded-full bg-[#E29ED5]/15 blur-[80px] transition-transform duration-1000 group-hover:-translate-x-5" />
          <div className="relative">
            <p className="text-[13px] font-medium uppercase tracking-[0.15em] text-slate-500 dark:text-white/50">Get started today</p>
            <h2 id="cta-heading" className="mx-auto mt-4 max-w-[560px] text-[clamp(28px,4vw,48px)] font-semibold leading-[1.1] tracking-[-0.025em] text-slate-900 dark:text-white">
              Ready to find your next story?
            </h2>
            <p className="mx-auto mt-5 max-w-[480px] text-[16px] leading-[1.7] text-slate-500 dark:text-white/55">
              Explore without signing up, or join Verkli to follow authors and save your reading. Built so authors can keep writing and readers get more of what matters.
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
              <Link href="/reader/discover" className="btn-primary min-w-[180px]">Explore stories</Link>
              <Link href="/reader/signup" className="btn-secondary min-w-[140px]">Join Verkli</Link>
            </div>
            <p className="mt-8 text-[13px] text-slate-400 dark:text-white/35">
              Are you an author?{" "}
              <Link href="/author" className="font-medium underline decoration-slate-300 underline-offset-2 transition hover:text-slate-600 hover:decoration-slate-400 dark:decoration-white/20 dark:hover:text-white/60">
                Go to authors page →
              </Link>
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
