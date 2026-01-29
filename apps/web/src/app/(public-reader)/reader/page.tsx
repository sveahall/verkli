"use client";

import Link from "next/link";
import GlassSurface from "@/components/GlassSurface";

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
  return (
    <main className="relative min-h-screen bg-gradient-to-b from-slate-50 via-slate-50/95 to-slate-50/90 text-slate-900 dark:from-[#050508] dark:via-[#050508] dark:to-[#050508] dark:text-white">
      {/* Hero */}
      <section className="relative flex min-h-[min(100dvh,80rem)] w-full flex-col items-center justify-center px-4 py-16 text-center dark:bg-[#050508] sm:px-6">
        <div className="pointer-events-none absolute inset-0 h-full w-full">
          <div
            className="absolute left-1/4 top-0 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full blur-[150px] opacity-20 dark:opacity-[0.04]"
            style={{ background: "#907AFF", animationDuration: "4s" }}
          />
          <div
            className="absolute bottom-1/4 right-1/4 h-[400px] w-[400px] translate-x-1/2 animate-pulse rounded-full blur-[120px] opacity-[0.15] dark:opacity-[0.03]"
            style={{ background: "#E29ED5", animationDuration: "5s", animationDelay: "1s" }}
          />
          <div
            className="absolute left-1/2 top-1/2 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full blur-[100px] opacity-10 dark:opacity-[0.025]"
            style={{ background: "#FCC997", animationDuration: "3s", animationDelay: "0.5s" }}
          />
          <div className="absolute inset-0 hidden bg-gradient-to-b from-[#050508]/95 via-[#050508]/92 to-[#050508]/98 dark:block" aria-hidden />
        </div>

        <div className="relative z-10 mx-auto w-full max-w-[1200px]">
          <h1 className="text-[clamp(1.75rem,5vw+1rem,4rem)] font-medium leading-[1.1] tracking-[-0.02em] text-slate-900 dark:text-white">
            Stories that find you.
            <br />
            <span className="bg-gradient-to-r from-[#907AFF] via-[#E29ED5] to-[#FCC997] bg-clip-text text-transparent">
              Read without the noise.
            </span>
          </h1>
          <p className="mx-auto mt-4 max-w-[480px] px-2 text-[15px] leading-relaxed text-slate-600 dark:text-white/50 sm:mt-6 sm:text-[16px]">
            Discover, follow, and immerse yourself. Verkli is where readers and authors meet—calm, human, and built for the stories that move you.
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-3 sm:mt-10 sm:gap-4">
            <Link href="#explore" className="inline-flex min-h-[44px] items-center justify-center">
              <GlassSurface
                {...glassBaseProps}
                width="auto"
                height="auto"
                borderRadius={999}
                className="glass-button border border-black/10 transition-transform hover:scale-[1.02] dark:border-white/20"
              >
                <span className="px-6 py-3 text-[14px] font-medium text-slate-900 dark:text-white sm:px-8 sm:text-[15px]">
                  Explore stories
                </span>
              </GlassSurface>
            </Link>
            <Link
              href="/reader/signup"
              className="flex items-center gap-2 rounded-full border border-black/10 px-8 py-3.5 text-[15px] font-medium text-slate-600 transition-all hover:border-black/20 hover:text-slate-900 dark:border-white/10 dark:text-white/60 dark:hover:border-white/20 dark:hover:text-white/80"
            >
              Join Verkli
            </Link>
          </div>
          <p className="mt-6 text-[13px] text-slate-500 dark:text-white/50">
            Are you a writer?<br />
            <Link href="/writer" className="font-semibold text-slate-700 hover:text-slate-900 dark:text-white/80 dark:hover:text-white">
              Go to authors page
            </Link>
          </p>
        </div>
      </section>

      {/* Value proposition */}
      <section
        id="explore"
        className="relative mx-auto w-full max-w-[1200px] px-4 py-16 sm:px-6 sm:py-24"
        aria-labelledby="value-heading"
      >
        <h2 id="value-heading" className="sr-only">
          Why Verkli for readers
        </h2>
        <p className="mx-auto max-w-[560px] text-center text-2xl font-medium tracking-[-0.02em] text-slate-900 dark:text-white sm:text-[32px]">
          A place to discover and stay close to what you love
        </p>
        <p className="mx-auto mt-3 max-w-[420px] text-center text-[15px] text-slate-600 dark:text-white/50">
          Built for readers who want more than a feed.
        </p>

        <div className="mt-10 grid gap-6 sm:mt-14 sm:grid-cols-2 lg:grid-cols-4">
          {valueBenefits.map((benefit, i) => (
            <article
              key={i}
              className="rounded-2xl border border-slate-200/80 bg-white/80 p-6 dark:border-white/[0.12] dark:bg-white/[0.04]"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200/80 bg-slate-50/80 text-slate-600 dark:border-white/[0.12] dark:bg-white/[0.06] dark:text-white/70">
                {benefit.icon}
              </div>
              <h3 className="mt-4 text-[17px] font-medium text-slate-900 dark:text-white">
                {benefit.title}
              </h3>
              <p className="mt-2 text-[14px] leading-relaxed text-slate-600 dark:text-white/55">
                {benefit.description}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* How it works */}
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

        <div className="mt-10 flex flex-col gap-8 sm:mt-14 md:flex-row md:gap-6 lg:gap-10">
          {howItWorksSteps.map((item) => (
            <article
              key={item.step}
              className="flex flex-1 flex-col rounded-2xl border border-slate-200/80 bg-white/80 p-6 dark:border-white/[0.12] dark:bg-white/[0.04]"
            >
              <span
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-[14px] font-medium text-white dark:bg-white dark:text-slate-900"
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
      </section>

      {/* Why Verkli is different */}
      <section
        className="relative mx-auto w-full max-w-[1200px] px-4 py-16 sm:px-6 sm:py-24"
        aria-labelledby="different-heading"
      >
        <h2 id="different-heading" className="text-2xl font-medium tracking-[-0.02em] text-slate-900 dark:text-white sm:text-[32px]">
          Why Verkli is different
        </h2>
        <p className="mt-2 text-[15px] text-slate-600 dark:text-white/50">
          Not just another reading app.
        </p>

        <ul className="mt-10 space-y-6 sm:mt-14">
          {whyDifferent.map((item, i) => (
            <li
              key={i}
              className="flex gap-4 rounded-2xl border border-slate-200/80 bg-white/80 px-6 py-5 dark:border-white/[0.12] dark:bg-white/[0.04]"
            >
              <span className="mt-0.5 h-2 w-2 flex-shrink-0 rounded-full bg-[#907AFF]" aria-hidden />
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
      </section>

      {/* Soft crossover – authors & readers */}
      <section
        className="relative mx-auto w-full max-w-[1200px] px-4 py-16 sm:px-6 sm:py-24"
        aria-labelledby="crossover-heading"
      >
        <div className="mx-auto max-w-[640px] rounded-2xl border border-slate-200/80 bg-white/80 px-6 py-8 text-center dark:border-white/[0.12] dark:bg-white/[0.04] sm:px-10 sm:py-10">
          <h2 id="crossover-heading" className="text-xl font-medium tracking-[-0.02em] text-slate-900 dark:text-white sm:text-2xl">
            Built so authors can keep writing
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-slate-600 dark:text-white/55">
            Verkli is designed to support authors sustainably—so they can focus on the stories you love. When creators are supported, readers get more of what matters: great writing, direct connection, and a place that puts both of you first.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section
        className="relative mx-auto w-full max-w-[1200px] px-4 py-16 sm:px-6 sm:py-24"
        aria-labelledby="cta-heading"
      >
        <div className="mx-auto max-w-[560px] rounded-2xl border border-slate-200/80 bg-white/80 px-6 py-12 text-center dark:border-white/[0.12] dark:bg-white/[0.04] sm:px-10 sm:py-14">
          <h2 id="cta-heading" className="text-2xl font-medium tracking-[-0.02em] text-slate-900 dark:text-white sm:text-[28px]">
            Ready to find your next story?
          </h2>
          <p className="mt-3 text-[15px] text-slate-600 dark:text-white/55">
            Explore without signing up, or join Verkli to follow authors and save your reading.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3 sm:gap-4">
            <Link href="#explore" className="inline-flex min-h-[44px] items-center justify-center">
              <GlassSurface
                {...glassBaseProps}
                width="auto"
                height="auto"
                borderRadius={999}
                className="glass-button border border-black/10 transition-transform hover:scale-[1.02] dark:border-white/20"
              >
                <span className="px-6 py-3 text-[14px] font-medium text-slate-900 dark:text-white sm:px-8 sm:text-[15px]">
                  Explore stories
                </span>
              </GlassSurface>
            </Link>
            <Link
              href="/reader/signup"
              className="flex min-h-[44px] items-center justify-center rounded-full border border-black/10 px-8 py-3.5 text-[15px] font-medium text-slate-600 transition-all hover:border-black/20 hover:text-slate-900 dark:border-white/10 dark:text-white/60 dark:hover:border-white/20 dark:hover:text-white/80"
            >
              Join Verkli
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
