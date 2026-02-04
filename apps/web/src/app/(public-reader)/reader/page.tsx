"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const valueBenefits = [
  {
    title: "Discover stories you actually care about",
    description: "Find work that resonates. No endless scrolling—curated paths to stories that matter to you.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
      </svg>
    ),
  },
  {
    title: "Follow authors directly",
    description: "Stay close to the people who write. Get new chapters and updates without algorithms in the way.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998-0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
      </svg>
    ),
  },
  {
    title: "Read across genres in one place",
    description: "Fiction, essays, serials—all in a single home. Switch moods, not apps.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
      </svg>
    ),
  },
  {
    title: "Support authors you love",
    description: "Your attention and support go straight to creators. Read knowing you’re part of their journey.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
      </svg>
    ),
  },
];

const howItWorksSteps = [
  { step: 1, title: "Discover stories", description: "Browse by mood, genre, or author. Find something that pulls you in." },
  { step: 2, title: "Follow authors or series", description: "Stay updated on what you care about. No feed noise." },
  { step: 3, title: "Read and engage", description: "Dive in. Comment, save, and return whenever you’re ready." },
];

const whyDifferent = [
  { title: "Direct connection to authors", text: "Stories and updates come from the people who write them, not from an algorithm." },
  { title: "Less noise, more quality", text: "A place built for reading, not for infinite scroll or engagement tricks." },
  { title: "Built for long-form storytelling", text: "Serials, novels, and essays get the space they need—no squeezing into feeds." },
  { title: "Reader-first platform", text: "Every decision starts with how it feels to read and discover, not to advertise." },
];

export default function ReaderLanding() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setAuthChecked(true);
        return;
      }
      const role = user.user_metadata?.active_role ?? user.user_metadata?.role;
      if (role === "reader") {
        router.replace("/reader/home");
        return;
      }
      const { data: profile } = await supabase.from("profiles").select("role").eq("user_id", user.id).maybeSingle();
      if (profile?.role === "reader") {
        router.replace("/reader/home");
        return;
      }
      setAuthChecked(true);
    };
    check();
  }, [router]);

  const [heroMousePos, setHeroMousePos] = useState({ x: 0.5, y: 0.5 });
  const heroRef = useRef<HTMLElement>(null);
  const handleHeroMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    if (!heroRef.current) return;
    const rect = heroRef.current.getBoundingClientRect();
    setHeroMousePos({ x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height });
  };
  const resetHeroMouse = () => setHeroMousePos({ x: 0.5, y: 0.5 });

  const [valueMousePos, setValueMousePos] = useState({ x: 0.5, y: 0.5 });
  const [valueHovering, setValueHovering] = useState(false);
  const valueRef = useRef<HTMLDivElement>(null);
  const handleValueMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!valueRef.current) return;
    const rect = valueRef.current.getBoundingClientRect();
    setValueMousePos({ x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height });
  };

  const [howMousePos, setHowMousePos] = useState({ x: 0.5, y: 0.5 });
  const [howHovering, setHowHovering] = useState(false);
  const howRef = useRef<HTMLDivElement>(null);
  const handleHowMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!howRef.current) return;
    const rect = howRef.current.getBoundingClientRect();
    setHowMousePos({ x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height });
  };

  const [whyMousePos, setWhyMousePos] = useState({ x: 0.5, y: 0.5 });
  const [whyHovering, setWhyHovering] = useState(false);
  const whyRef = useRef<HTMLDivElement>(null);
  const handleWhyMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!whyRef.current) return;
    const rect = whyRef.current.getBoundingClientRect();
    setWhyMousePos({ x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height });
  };

  const [crossoverMousePos, setCrossoverMousePos] = useState({ x: 0.5, y: 0.5 });
  const [crossoverHovering, setCrossoverHovering] = useState(false);
  const crossoverRef = useRef<HTMLDivElement>(null);
  const handleCrossoverMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!crossoverRef.current) return;
    const rect = crossoverRef.current.getBoundingClientRect();
    setCrossoverMousePos({ x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height });
  };

  const [ctaMousePos, setCtaMousePos] = useState({ x: 0.5, y: 0.5 });
  const [ctaHovering, setCtaHovering] = useState(false);
  const ctaRef = useRef<HTMLDivElement>(null);
  const handleCtaMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!ctaRef.current) return;
    const rect = ctaRef.current.getBoundingClientRect();
    setCtaMousePos({ x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height });
  };

  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-[#050508]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-[#907AFF] dark:border-white/20 dark:border-t-[#907AFF]" />
      </div>
    );
  }

  return (
    <main className="relative min-h-screen bg-gradient-to-b from-slate-50 via-slate-50/95 to-slate-50/90 text-slate-900 dark:from-[#050508] dark:via-[#050508] dark:to-[#050508] dark:text-white">
      {/* Hero – mouse-tracking glows (same pattern as author landing) */}
      <section
        ref={heroRef}
        onMouseMove={handleHeroMouseMove}
        onMouseLeave={resetHeroMouse}
        className="relative flex min-h-[min(100dvh,80rem)] w-full flex-col items-center justify-center px-4 py-16 text-center dark:bg-[#050508] sm:px-6"
      >
        <div className="pointer-events-none absolute inset-0 h-full w-full overflow-hidden">
          <div className="absolute left-0 right-0 top-0 z-[1] h-20 bg-slate-50 dark:bg-[#050508]" aria-hidden />
          <div className="absolute z-[2] h-[600px] w-[600px] rounded-full blur-[180px] opacity-25 transition-all duration-1000 ease-out dark:opacity-[0.2]" style={{ background: "#907AFF", left: `${heroMousePos.x * 100 - 30}%`, top: `${heroMousePos.y * 100 - 30}%` }} />
          <div className="absolute z-[2] h-[400px] w-[400px] rounded-full blur-[150px] opacity-20 transition-all duration-[1500ms] ease-out dark:opacity-[0.15]" style={{ background: "#E29ED5", left: `${(1 - heroMousePos.x) * 100 - 20}%`, top: `${heroMousePos.y * 100 - 20}%` }} />
          <div className="absolute z-[2] h-[300px] w-[300px] rounded-full blur-[120px] opacity-15 transition-all duration-700 ease-out dark:opacity-[0.12]" style={{ background: "#FCC997", left: `${heroMousePos.x * 70 + 15}%`, top: `${(1 - heroMousePos.y) * 60 + 20}%` }} />
          <div className="absolute inset-0 z-[3] bg-gradient-to-b from-white/60 via-transparent to-slate-50/80 dark:from-[#050508]/75 dark:via-[#050508]/50 dark:to-[#050508]/90" aria-hidden />
        </div>

        <div className="relative z-10 mx-auto mb-20 flex w-full max-w-[1200px] flex-col items-center gap-10 lg:flex-row lg:gap-16 lg:text-left xl:gap-20">
          <div className="flex-1">
            <h1 className="text-[clamp(1.75rem,5vw+1rem,4rem)] font-semibold leading-[1.05] tracking-[-0.03em] text-slate-900 dark:text-white md:text-[52px] lg:text-[56px]">
              Stories that find you.
              <br />
              <span className="bg-gradient-to-r from-[#907AFF] via-[#E29ED5] to-[#FCC997] bg-clip-text text-transparent">
                Read without the noise.
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-[520px] px-2 text-[16px] leading-relaxed text-slate-600 dark:text-white/50 sm:mt-8 sm:text-[17px] lg:mx-0 lg:max-w-[480px]">
              Discover, follow, and immerse yourself. Verkli is where readers and authors meet—calm, human, and built for the stories that move you.
            </p>

            <div className="mt-10 flex flex-wrap justify-center gap-3 sm:gap-4 lg:justify-start">
<<<<<<< HEAD
              <Link href="/reader/discover" className="btn-primary min-w-[140px]">
                Explore stories
              </Link>
              <Link href="/reader/signup" className="btn-secondary min-w-[140px]">
                Join Verkli
              </Link>
            </div>
            <p className="mt-6 text-[13px] text-slate-500 dark:text-white/50">
              Are you a author?<br />
=======
              <Link href="#explore" className="btn-primary min-w-[140px]">
                Explore stories
              </Link>
              <Link href="/reader/signup" className="btn-secondary min-w-[140px]">
                Join verkli
              </Link>
            </div>
            <p className="mt-6 text-[13px] text-slate-500 dark:text-white/50">
              Are you an author?<br />
>>>>>>> main
              <Link href="/author" className="font-semibold text-slate-700 hover:text-slate-900 dark:text-white/80 dark:hover:text-white">
                Go to authors page →
              </Link>
            </p>
          </div>

<<<<<<< HEAD
          {/* Reading app preview */}
=======
          {/* Mobile mockup – reading app preview */}
>>>>>>> main
          <div className="flex flex-shrink-0 justify-center lg:justify-end">
            <div className="relative rounded-[2rem] border border-slate-200/80 bg-slate-100/90 p-2 dark:border-white/15 dark:bg-slate-900/90">
              <div className="h-[420px] w-[220px] overflow-hidden rounded-[1.5rem] bg-white dark:bg-slate-950">
                {/* Status bar */}
                <div className="flex items-center justify-between px-4 pt-3 pb-2 text-[10px] text-slate-400 dark:text-white/40">
                  <span>9:41</span>
                  <div className="flex gap-1">
                    <span className="h-1.5 w-4 rounded-sm bg-slate-300 dark:bg-white/30" />
                    <span className="h-1.5 w-3 rounded-sm bg-slate-300 dark:bg-white/30" />
                    <span className="h-1.5 w-5 rounded-sm bg-slate-300 dark:bg-white/30" />
                  </div>
                </div>
                {/* App content */}
                <div className="px-4 pb-6">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400 dark:text-white/50">Continue reading</p>
                  <div className="mt-3 flex gap-3">
                    <div className="h-16 w-11 flex-shrink-0 rounded-lg bg-gradient-to-br from-[#907AFF]/40 to-[#E29ED5]/40 dark:from-[#907AFF]/30 dark:to-[#E29ED5]/30" />
                    <div className="min-w-0 flex-1">
                      <div className="h-3 w-full rounded bg-slate-200 dark:bg-white/20" />
                      <div className="mt-2 h-2.5 w-4/5 rounded bg-slate-100 dark:bg-white/10" />
                      <div className="mt-4 h-1.5 w-full rounded-full bg-slate-100 dark:bg-white/10">
                        <div className="h-full w-1/3 rounded-full bg-[#907AFF]/70" />
                      </div>
                    </div>
                  </div>
                  <div className="mt-6 border-t border-slate-100 dark:border-white/10 pt-4">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400 dark:text-white/50">For you</p>
                    <div className="mt-3 space-y-3">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="flex gap-3">
                          <div className="h-12 w-9 flex-shrink-0 rounded bg-slate-100 dark:bg-white/10" />
                          <div className="min-w-0 flex-1 space-y-1.5">
                            <div className="h-2.5 w-full rounded bg-slate-200 dark:bg-white/15" />
                            <div className="h-2 w-2/3 rounded bg-slate-100 dark:bg-white/10" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Value proposition – mouse-reactive blobs (author-style) */}
      <section
        id="explore"
        className="relative mx-auto w-full max-w-[1200px] px-4 py-16 sm:px-6 sm:py-24"
        aria-labelledby="value-heading"
      >
        <h2 id="value-heading" className="sr-only">
<<<<<<< HEAD
          Why Verkli for readers
=======
          Why verkli for readers
>>>>>>> main
        </h2>
        <div
          ref={valueRef}
          onMouseMove={handleValueMouseMove}
          onMouseEnter={() => setValueHovering(true)}
          onMouseLeave={() => { setValueMousePos({ x: 0.5, y: 0.5 }); setValueHovering(false); }}
          className="relative overflow-hidden rounded-[32px] border border-black/10 bg-gradient-to-br from-[#907AFF]/15 via-[#E29ED5]/08 to-[#FCC997]/12 p-8 dark:border-white/[0.1] dark:from-[#907AFF]/25 dark:via-[#E29ED5]/12 dark:to-[#FCC997]/18 md:p-10"
        >
          <div className="pointer-events-none absolute inset-0 -z-10">
            <div className="absolute h-[400px] w-[400px] rounded-full blur-[120px] transition-all duration-700 ease-out" style={{ background: "#907AFF", opacity: valueHovering ? 0.2 : 0.1, left: `${valueMousePos.x * 100 - 25}%`, top: `${valueMousePos.y * 100 - 25}%` }} />
            <div className="absolute h-[320px] w-[320px] rounded-full blur-[100px] transition-all duration-1000 ease-out" style={{ background: "#E29ED5", opacity: valueHovering ? 0.16 : 0.08, left: `${(1 - valueMousePos.x) * 100 - 20}%`, top: `${(1 - valueMousePos.y) * 100 - 20}%` }} />
            <div className="absolute h-[240px] w-[240px] rounded-full blur-[80px] transition-all duration-500 ease-out" style={{ background: "#FCC997", opacity: valueHovering ? 0.12 : 0.06, left: `${valueMousePos.x * 80 + 10}%`, top: `${valueMousePos.y * 60 + 20}%` }} />
          </div>
          <p className="relative mx-auto max-w-[560px] text-center text-2xl font-medium tracking-[-0.02em] text-slate-900 dark:text-white sm:text-[32px]">
            A place to <span className="bg-gradient-to-r from-[#907AFF] via-[#E29ED5] to-[#FCC997] bg-clip-text text-transparent">discover</span> and stay close to what you love
          </p>
          <p className="relative mx-auto mt-3 max-w-[420px] text-center text-[15px] text-slate-600 dark:text-white/50">
            Built for readers who want more than a feed.
          </p>

          <div className="relative mt-10 grid gap-6 sm:mt-14 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { ...valueBenefits[0], color: "#907AFF" },
              { ...valueBenefits[1], color: "#E29ED5" },
              { ...valueBenefits[2], color: "#FCC997" },
              { ...valueBenefits[3], color: "#FEE9A3" },
            ].map((benefit, i) => (
              <article
                key={i}
                className="group relative overflow-hidden rounded-2xl border border-black/10 bg-white/90 p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-black/15 dark:border-white/[0.12] dark:bg-white/[0.06] dark:hover:border-white/[0.2]"
              >
                <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full blur-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-40" style={{ background: benefit.color }} />
                <div className="relative mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 transition-transform duration-500 group-hover:scale-110 dark:text-white/70" style={{ background: `linear-gradient(135deg, ${benefit.color}30, ${benefit.color}12)` }}>
                  {benefit.icon}
                </div>
                <h3 className="text-[17px] font-medium text-slate-900 dark:text-white">
                  {benefit.title}
                </h3>
                <p className="mt-2 text-[14px] leading-relaxed text-slate-600 dark:text-white/55">
                  {benefit.description}
                </p>
              </article>
          ))}
          </div>
        </div>
      </section>

      {/* How it works – mouse-tracking */}
      <section
        className="relative mx-auto w-full max-w-[1200px] px-4 py-16 sm:px-6 sm:py-24"
        aria-labelledby="how-heading"
      >
        <h2 id="how-heading" className="text-2xl font-medium tracking-[-0.02em] text-slate-900 dark:text-white sm:text-[32px]">
          How it works for readers
        </h2>
        <p className="mt-2 text-[15px] text-slate-600 dark:text-white/50">
          Simple. No clutter.
        </p>

        <div
          ref={howRef}
          onMouseMove={handleHowMouseMove}
          onMouseEnter={() => setHowHovering(true)}
          onMouseLeave={() => { setHowMousePos({ x: 0.5, y: 0.5 }); setHowHovering(false); }}
          className="relative mt-10 overflow-hidden rounded-[32px] border border-black/10 bg-gradient-to-br from-[#907AFF]/10 via-transparent to-[#FCC997]/10 p-8 dark:border-white/[0.08] dark:from-[#907AFF]/15 dark:to-[#FCC997]/15 md:mt-14 md:p-10"
        >
          <div className="pointer-events-none absolute inset-0 -z-10">
            <div className="absolute h-[350px] w-[350px] rounded-full blur-[100px] transition-all duration-700 ease-out" style={{ background: "#907AFF", opacity: howHovering ? 0.15 : 0.06, left: `${howMousePos.x * 100 - 25}%`, top: `${howMousePos.y * 100 - 25}%` }} />
            <div className="absolute h-[280px] w-[280px] rounded-full blur-[80px] transition-all duration-1000 ease-out" style={{ background: "#E29ED5", opacity: howHovering ? 0.12 : 0.05, left: `${(1 - howMousePos.x) * 100 - 20}%`, top: `${(1 - howMousePos.y) * 100 - 20}%` }} />
            <div className="absolute h-[200px] w-[200px] rounded-full blur-[60px] transition-all duration-500 ease-out" style={{ background: "#FCC997", opacity: howHovering ? 0.1 : 0.04, left: `${howMousePos.x * 80 + 10}%`, top: `${howMousePos.y * 60 + 20}%` }} />
          </div>
          <div className="relative flex flex-col gap-8 md:flex-row md:gap-6 lg:gap-10">
            {[
              { ...howItWorksSteps[0], color: "#907AFF" },
              { ...howItWorksSteps[1], color: "#E29ED5" },
              { ...howItWorksSteps[2], color: "#FCC997" },
            ].map((item) => (
              <article
                key={item.step}
                className="group relative flex flex-1 flex-col overflow-hidden rounded-2xl border border-black/10 bg-white/90 p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-black/15 dark:border-white/[0.12] dark:bg-white/[0.06] dark:hover:border-white/[0.2]"
              >
              <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full blur-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-40" style={{ background: item.color }} />
              <span
                className="relative inline-flex h-9 w-9 items-center justify-center rounded-full text-[14px] font-medium text-white"
                style={{ background: item.color }}
                aria-hidden
              >
                {item.step}
              </span>
              <h3 className="mt-4 text-[17px] font-medium text-slate-900 dark:text-white">
                {item.title}
              </h3>
              <p className="mt-2 text-[14px] leading-relaxed text-slate-600 dark:text-white/55">
                {item.description}
              </p>
            </article>
          ))}
          </div>
        </div>
      </section>

      {/* Why Verkli is different – mouse-tracking */}
      <section
        className="relative mx-auto w-full max-w-[1200px] px-4 py-16 sm:px-6 sm:py-24"
        aria-labelledby="different-heading"
      >
        <h2 id="different-heading" className="text-2xl font-medium tracking-[-0.02em] text-slate-900 dark:text-white sm:text-[32px]">
<<<<<<< HEAD
          Why Verkli is <span className="bg-gradient-to-r from-[#907AFF] via-[#E29ED5] to-[#FCC997] bg-clip-text text-transparent">different</span>
=======
          Why verkli is <span className="bg-gradient-to-r from-[#907AFF] via-[#E29ED5] to-[#FCC997] bg-clip-text text-transparent">different</span>
>>>>>>> main
        </h2>
        <p className="mt-2 text-[15px] text-slate-600 dark:text-white/50">
          Not just another reading app.
        </p>

        <div
          ref={whyRef}
          onMouseMove={handleWhyMouseMove}
          onMouseEnter={() => setWhyHovering(true)}
          onMouseLeave={() => { setWhyMousePos({ x: 0.5, y: 0.5 }); setWhyHovering(false); }}
          className="relative mt-10 overflow-hidden rounded-[32px] border border-black/10 bg-gradient-to-br from-[#E29ED5]/10 via-transparent to-[#907AFF]/10 p-8 dark:border-white/[0.08] dark:from-[#E29ED5]/15 dark:to-[#907AFF]/15 sm:mt-14 md:p-10"
        >
          <div className="pointer-events-none absolute inset-0 -z-10">
            <div className="absolute h-[350px] w-[350px] rounded-full blur-[100px] transition-all duration-700 ease-out" style={{ background: "#E29ED5", opacity: whyHovering ? 0.15 : 0.06, left: `${whyMousePos.x * 100 - 25}%`, top: `${whyMousePos.y * 100 - 25}%` }} />
            <div className="absolute h-[280px] w-[280px] rounded-full blur-[80px] transition-all duration-1000 ease-out" style={{ background: "#907AFF", opacity: whyHovering ? 0.12 : 0.05, left: `${(1 - whyMousePos.x) * 100 - 20}%`, top: `${(1 - whyMousePos.y) * 100 - 20}%` }} />
            <div className="absolute h-[200px] w-[200px] rounded-full blur-[60px] transition-all duration-500 ease-out" style={{ background: "#FCC997", opacity: whyHovering ? 0.1 : 0.04, left: `${whyMousePos.x * 80 + 10}%`, top: `${whyMousePos.y * 60 + 20}%` }} />
          </div>
          <ul className="relative space-y-6">
            {[
              { ...whyDifferent[0], color: "#907AFF" },
              { ...whyDifferent[1], color: "#E29ED5" },
              { ...whyDifferent[2], color: "#FCC997" },
              { ...whyDifferent[3], color: "#FEE9A3" },
            ].map((item, i) => (
              <li
                key={i}
                className="group flex gap-4 rounded-2xl border border-black/10 bg-white/90 px-6 py-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-black/15 dark:border-white/[0.12] dark:bg-white/[0.06] dark:hover:border-white/[0.2]"
              >
              <span className="mt-0.5 h-2 w-2 flex-shrink-0 rounded-full transition-transform duration-300 group-hover:scale-125" style={{ background: item.color }} aria-hidden />
              <div>
                <h3 className="text-[17px] font-medium text-slate-900 dark:text-white">
                  {item.title}
                </h3>
                <p className="mt-1 text-[14px] leading-relaxed text-slate-600 dark:text-white/55">
                  {item.text}
                </p>
              </div>
            </li>
          ))}
          </ul>
        </div>
      </section>

      {/* Soft crossover – authors & readers, mouse-tracking */}
      <section
        className="relative mx-auto w-full max-w-[1200px] px-4 py-16 sm:px-6 sm:py-24"
        aria-labelledby="crossover-heading"
      >
        <div
          ref={crossoverRef}
          onMouseMove={handleCrossoverMouseMove}
          onMouseEnter={() => setCrossoverHovering(true)}
          onMouseLeave={() => { setCrossoverMousePos({ x: 0.5, y: 0.5 }); setCrossoverHovering(false); }}
          className="relative mx-auto max-w-[640px] overflow-hidden rounded-2xl border border-black/10 bg-gradient-to-br from-[#907AFF]/10 via-transparent to-[#FCC997]/10 px-6 py-8 text-center transition-all duration-300 hover:border-black/15 dark:border-white/[0.12] dark:from-[#907AFF]/15 dark:to-[#FCC997]/15 dark:hover:border-white/[0.2] sm:px-10 sm:py-10"
        >
          <div className="pointer-events-none absolute inset-0 -z-10">
            <div className="absolute h-[300px] w-[300px] rounded-full blur-[100px] transition-all duration-700 ease-out" style={{ background: "#907AFF", opacity: crossoverHovering ? 0.14 : 0.06, left: `${crossoverMousePos.x * 100 - 25}%`, top: `${crossoverMousePos.y * 100 - 25}%` }} />
            <div className="absolute h-[240px] w-[240px] rounded-full blur-[80px] transition-all duration-1000 ease-out" style={{ background: "#FCC997", opacity: crossoverHovering ? 0.1 : 0.04, left: `${(1 - crossoverMousePos.x) * 100 - 20}%`, top: `${(1 - crossoverMousePos.y) * 100 - 20}%` }} />
          </div>
          <h2 id="crossover-heading" className="relative text-xl font-medium tracking-[-0.02em] text-slate-900 dark:text-white sm:text-2xl">
            Built so authors can keep writing
          </h2>
          <p className="relative mt-4 text-[15px] leading-relaxed text-slate-600 dark:text-white/55">
<<<<<<< HEAD
            Verkli is designed to support authors sustainably—so they can focus on the stories you love. When creators are supported, readers get more of what matters: great writing, direct connection, and a place that puts both of you first.
=======
            verkli is designed to support authors sustainably—so they can focus on the stories you love. When creators are supported, readers get more of what matters: great writing, direct connection, and a place that puts both of you first.
>>>>>>> main
          </p>
        </div>
      </section>

      {/* CTA – mouse-tracking */}
      <section
        className="relative mx-auto w-full max-w-[1200px] px-4 py-16 sm:px-6 sm:py-24"
        aria-labelledby="cta-heading"
      >
        <div
          ref={ctaRef}
          onMouseMove={handleCtaMouseMove}
          onMouseEnter={() => setCtaHovering(true)}
          onMouseLeave={() => { setCtaMousePos({ x: 0.5, y: 0.5 }); setCtaHovering(false); }}
          className="relative mx-auto max-w-[560px] overflow-hidden rounded-2xl border border-black/10 bg-gradient-to-br from-[#907AFF]/15 via-[#E29ED5]/08 to-[#FCC997]/15 px-6 py-12 text-center transition-all duration-300 hover:border-[#907AFF]/30 dark:border-white/[0.12] dark:from-[#907AFF]/20 dark:via-[#E29ED5]/10 dark:to-[#FCC997]/20 dark:hover:border-[#907AFF]/40 sm:px-10 sm:py-14"
        >
          <div className="pointer-events-none absolute inset-0 -z-10">
            <div className="absolute h-[400px] w-[400px] rounded-full blur-[120px] transition-all duration-1000 ease-out" style={{ background: "#907AFF", opacity: ctaHovering ? 0.2 : 0.08, left: `${ctaMousePos.x * 100 - 25}%`, top: `${ctaMousePos.y * 100 - 25}%` }} />
            <div className="absolute h-[320px] w-[320px] rounded-full blur-[100px] transition-all duration-[1200ms] ease-out" style={{ background: "#E29ED5", opacity: ctaHovering ? 0.16 : 0.06, left: `${(1 - ctaMousePos.x) * 100 - 20}%`, top: `${(1 - ctaMousePos.y) * 100 - 20}%` }} />
            <div className="absolute h-[240px] w-[240px] rounded-full blur-[80px] transition-all duration-700 ease-out" style={{ background: "#FCC997", opacity: ctaHovering ? 0.12 : 0.05, left: `${ctaMousePos.x * 80 + 10}%`, top: `${ctaMousePos.y * 60 + 20}%` }} />
          </div>
          <h2 id="cta-heading" className="relative text-2xl font-medium tracking-[-0.02em] text-slate-900 dark:text-white sm:text-[28px]">
            Ready to find your next story?
          </h2>
          <p className="relative mt-3 text-[15px] text-slate-600 dark:text-white/55">
            Explore without signing up, or join Verkli to follow authors and save your reading.
          </p>
          <div className="relative mt-8 flex flex-wrap justify-center gap-3 sm:gap-4">
<<<<<<< HEAD
            <Link href="/reader/discover" className="btn-primary min-w-[140px]">
              Explore stories
            </Link>
            <Link href="/reader/signup" className="btn-secondary min-w-[140px]">
              Join Verkli
=======
            <Link href="#explore" className="btn-primary min-w-[140px]">
              Explore stories
            </Link>
            <Link href="/reader/signup" className="btn-secondary min-w-[140px]">
              Join verkli
>>>>>>> main
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
