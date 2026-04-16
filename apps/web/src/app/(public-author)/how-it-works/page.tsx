"use client";

import Link from "next/link";
import Reveal from "@/components/Reveal";
import BrandGradientText from "@/components/ui/brand-gradient-text";
import { BRAND_COLORS } from "@/lib/design/brand";

// ─── Step data ───────────────────────────────────────────────────────────────
const STEPS = [
  {
    number: "01",
    color: BRAND_COLORS.violet,
    title: "Upload your chapter",
    description:
      "Import any chapter or manuscript — Word, PDF, or plain text. Verkli reads your writing and understands its tone, genre, and key moments.",
    icon: "M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5",
    features: ["Word & PDF import", "Auto-detects tone & genre", "Supports all fiction and non-fiction"],
  },
  {
    number: "02",
    color: BRAND_COLORS.rose,
    title: "AI creates your content",
    description:
      "In seconds, Verkli generates platform-ready posts, short clips, hook quotes, and audiograms — all adapted to each platform's format and algorithm.",
    icon: "M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z",
    features: ["TikTok & Reels scripts", "Quote cards & carousels", "Audiogram clips from key scenes"],
  },
  {
    number: "03",
    color: BRAND_COLORS.amber,
    title: "Publish everywhere",
    description:
      "Schedule and distribute your content to Amazon, Spotify, Apple Books, Instagram, and 10+ platforms — from one single dashboard. No copy-pasting, no reformatting.",
    icon: "M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5",
    features: ["10+ platforms at once", "Smart scheduling", "One-click distribution"],
  },
  {
    number: "04",
    color: "#c894e6",
    title: "Grow your audience",
    description:
      "Track what content drives clicks, follows, and sales. Verkli shows you exactly which chapters resonate — so you can write more of what your readers love.",
    icon: "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z",
    features: ["Per-chapter analytics", "Platform performance", "Audience growth tracking"],
  },
];

// ─── Feature highlights ───────────────────────────────────────────────────────
const HIGHLIGHTS = [
  {
    color: BRAND_COLORS.violet,
    title: "2-minute setup",
    description: "Connect your accounts, upload a chapter, and your first content is live before your coffee gets cold.",
    icon: "M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z",
  },
  {
    color: BRAND_COLORS.rose,
    title: "No marketing skills needed",
    description: "Verkli handles the copywriting, formatting, and timing. You just write — we do the rest.",
    icon: "M15.182 15.182a4.5 4.5 0 01-6.364 0M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z",
  },
  {
    color: BRAND_COLORS.amber,
    title: "Your voice, amplified",
    description: "Every piece of content is written in your style — not generic AI filler. Readers can't tell it apart from you.",
    icon: "M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z",
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function HowItWorksPage() {
  return (
    <main className="author-light relative bg-background text-foreground -mt-[88px]">
      {/* ── Hero ── */}
      <section className="relative isolate mx-auto flex max-w-[1200px] flex-col items-center overflow-hidden px-6 pb-24 pt-[160px] text-center">
        {/* Ambient background */}
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(144,122,255,0.07),transparent_60%),radial-gradient(circle_at_80%_70%,rgba(226,158,213,0.05),transparent_50%)]" />
          <div className="absolute inset-0 bg-gradient-to-b from-background via-transparent to-background" />
        </div>

        <div className="hero-animate-down mb-6 inline-flex items-center gap-2 rounded-full border border-black/[0.08] bg-white/80 px-4 py-1.5 backdrop-blur-xl dark:border-white/[0.12] dark:bg-white/[0.04]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#907AFF]" />
          <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-slate-600 dark:text-white/60">How it works</span>
        </div>

        <h1 className="hero-animate max-w-[700px] text-[clamp(40px,5.5vw,72px)] font-semibold leading-[1.0] tracking-[-0.04em] text-slate-900 dark:text-white" style={{ animationDelay: "120ms" }}>
          From manuscript to{" "}
          <BrandGradientText>everywhere</BrandGradientText>
          {" "}in four steps.
        </h1>

        <p className="hero-animate mt-6 max-w-[480px] text-[clamp(16px,1.2vw,19px)] leading-[1.65] text-slate-500 dark:text-white/50" style={{ animationDelay: "280ms" }}>
          Verkli takes your writing and turns it into a content engine — without you changing how you write.
        </p>

        <div className="hero-animate mt-9 flex flex-col items-center gap-3 sm:flex-row" style={{ animationDelay: "420ms" }}>
          <Link href="/author/signup" className="btn-primary rounded-full px-8 py-3.5 text-[15px] shadow-[0_18px_40px_rgba(111,88,223,0.28)] sm:min-w-[192px]">
            Start for free
          </Link>
          <Link href="/author" className="btn-secondary rounded-full border-black/10 bg-white/80 px-7 py-3.5 text-[15px] sm:min-w-[164px]">
            Back to home
          </Link>
        </div>
      </section>

      {/* ── Steps ── */}
      <section className="mx-auto w-full max-w-[1200px] px-6 pb-28">
        <div className="flex flex-col gap-6">
          {STEPS.map((step, i) => (
            <Reveal key={step.number}>
              <div className="group relative overflow-hidden rounded-[28px] border border-black/[0.04] bg-white/60 p-8 backdrop-blur-sm transition-shadow duration-500 hover:shadow-[0_8px_40px_rgba(0,0,0,0.05)] dark:border-white/[0.06] dark:bg-white/[0.025] md:p-12">
                {/* Ambient glow */}
                <div
                  className="pointer-events-none absolute -right-20 -top-20 h-[360px] w-[360px] rounded-full blur-[120px] opacity-0 transition-opacity duration-700 group-hover:opacity-100"
                  style={{ background: step.color }}
                />

                <div className="relative grid gap-8 md:grid-cols-[auto_1fr_auto] md:items-center md:gap-12">
                  {/* Step number */}
                  <div
                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-[13px] font-bold tracking-widest text-white"
                    style={{ background: `linear-gradient(135deg, ${step.color}cc 0%, ${step.color} 100%)` }}
                  >
                    {step.number}
                  </div>

                  {/* Copy */}
                  <div>
                    <h2 className="text-[clamp(22px,2.8vw,30px)] font-semibold leading-[1.15] tracking-[-0.03em] text-slate-900 dark:text-white">
                      {step.title}
                    </h2>
                    <p className="mt-3 max-w-[520px] text-[16px] leading-[1.7] text-slate-500 dark:text-white/45">
                      {step.description}
                    </p>
                  </div>

                  {/* Feature pills */}
                  <div className="flex flex-wrap gap-2 md:flex-col md:items-end">
                    {step.features.map((f) => (
                      <div
                        key={f}
                        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium"
                        style={{ background: `${step.color}14`, color: step.color }}
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                        {f}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Connector line (not on last) */}
                {i < STEPS.length - 1 && (
                  <div className="absolute -bottom-3 left-[47px] hidden h-6 w-px bg-gradient-to-b from-black/10 to-transparent dark:from-white/10 md:block" />
                )}
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Feature highlights ── */}
      <Reveal>
        <section className="mx-auto w-full max-w-[1200px] px-6 pb-28">
          <div className="mb-12 text-center">
            <p className="text-[13px] font-medium uppercase tracking-[0.15em] text-[#907AFF]">Why authors love it</p>
            <h2 className="mt-4 text-[clamp(26px,3.2vw,40px)] font-semibold leading-[1.1] tracking-[-0.03em] text-slate-900 dark:text-white">
              Built for writers, not{" "}
              <BrandGradientText>marketers.</BrandGradientText>
            </h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {HIGHLIGHTS.map((h) => (
              <div
                key={h.title}
                className="group relative overflow-hidden rounded-[24px] border border-black/[0.04] bg-white/60 p-8 backdrop-blur-sm transition-all duration-500 hover:shadow-[0_8px_32px_rgba(0,0,0,0.05)] dark:border-white/[0.06] dark:bg-white/[0.025]"
              >
                <div
                  className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full blur-3xl opacity-0 transition-opacity duration-500 group-hover:opacity-50"
                  style={{ background: h.color }}
                />
                <div className="relative">
                  <div
                    className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-xl"
                    style={{ background: `${h.color}14` }}
                  >
                    <svg className="h-5 w-5" style={{ color: h.color }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={h.icon} />
                    </svg>
                  </div>
                  <h3 className="text-[18px] font-semibold leading-tight tracking-[-0.02em] text-slate-900 dark:text-white">{h.title}</h3>
                  <p className="mt-3 text-[14px] leading-[1.7] text-slate-500 dark:text-white/40">{h.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </Reveal>

      {/* ── CTA ── */}
      <Reveal>
        <section className="mx-auto w-full max-w-[1200px] px-6 pb-32">
          <div className="relative overflow-hidden rounded-[32px] border border-black/[0.04] bg-gradient-to-br from-[#907AFF]/[0.12] via-[#E29ED5]/[0.07] to-[#FCC997]/[0.05] p-10 text-center shadow-[0_2px_40px_rgba(144,122,255,0.06)] dark:border-white/[0.06] sm:p-16">
            <div className="pointer-events-none absolute -left-24 -top-24 h-[360px] w-[360px] rounded-full bg-[#907AFF]/15 blur-[120px]" />
            <div className="pointer-events-none absolute -bottom-16 -right-16 h-[280px] w-[280px] rounded-full bg-[#E29ED5]/12 blur-[100px]" />

            <div className="relative mx-auto max-w-[560px]">
              <p className="text-[12px] font-medium uppercase tracking-[0.16em] text-slate-500 dark:text-white/40">Ready to start?</p>
              <h2 className="mt-4 text-[clamp(28px,3.5vw,44px)] font-semibold leading-[1.1] tracking-[-0.04em] text-slate-900 dark:text-white">
                Your next chapter deserves to be read.
              </h2>
              <p className="mt-5 text-[16px] leading-[1.7] text-slate-500 dark:text-white/50">
                Join 2,000+ authors who turned their writing into audiences. No credit card required.
              </p>
              <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                <Link href="/author/signup" className="btn-primary rounded-full px-8 py-3.5 text-[15px] shadow-[0_18px_40px_rgba(111,88,223,0.28)] sm:min-w-[200px]">
                  Start for free
                </Link>
                <Link href="/pricing" className="btn-secondary rounded-full border-black/10 bg-white/80 px-7 py-3.5 text-[15px] sm:min-w-[160px]">
                  See pricing
                </Link>
              </div>
            </div>
          </div>
        </section>
      </Reveal>
    </main>
  );
}
