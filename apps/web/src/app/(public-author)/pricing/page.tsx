"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Minus } from "lucide-react";
import Reveal from "@/components/Reveal";
import BrandGradientText from "@/components/ui/brand-gradient-text";
import { BRAND_COLORS } from "@/lib/design/brand";

// ─── Data ────────────────────────────────────────────────────────────────────

const FEATURE_GROUPS = [
  {
    label: "Writing & publishing",
    rows: [
      { label: "Books", free: "Up to 3", pro: "Unlimited" },
      { label: "Rich text editor", free: true, pro: true },
      { label: "Formatting & publishing tools", free: true, pro: true },
    ],
  },
  {
    label: "AI features",
    rows: [
      { label: "AI translation (20+ languages)", free: false, pro: true },
      { label: "Audiobook generation", free: false, pro: true },
      { label: "AI marketing campaigns", free: false, pro: true },
      { label: "Book trailer (AI video)", free: false, pro: true },
      { label: "Multiple book versions", free: false, pro: true },
    ],
  },
  {
    label: "Analytics & support",
    rows: [
      { label: "Basic analytics", free: true, pro: true },
      { label: "Advanced analytics & country map", free: false, pro: true },
      { label: "Community support", free: true, pro: true },
      { label: "Priority support", free: false, pro: true },
    ],
  },
];

const FAQS = [
  {
    q: "Can I start for free?",
    a: "Yes. The Free plan lets you write and publish up to three books with no credit card required. Upgrade anytime to unlock AI features.",
  },
  {
    q: "What does AI translation include?",
    a: "Verkli Pro translates your entire book — every chapter — into 20+ languages using a production-grade translation pipeline. You get a fully separate book version for each language, ready to publish.",
  },
  {
    q: "How does audiobook generation work?",
    a: "Select any book version and choose a voice. Verkli generates a full audiobook audio file per chapter, which you can listen to, download, or publish alongside your text edition.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Absolutely. You can cancel your Pro subscription at any time from your billing settings. You'll keep Pro access until the end of the billing period.",
  },
  {
    q: "Is there a yearly discount?",
    a: "Yes — annual billing saves you 35% compared to month-to-month. Toggle between monthly and annual on the pricing cards above.",
  },
  {
    q: "Do you offer team or enterprise plans?",
    a: "We're working on it. If you represent a publishing house or large team, reach out to us and we'll find something that works.",
  },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function FeatureCell({ value, isPro = false }: { value: boolean | string; isPro?: boolean }) {
  if (typeof value === "string") {
    return (
      <span className={`text-[13px] font-semibold ${isPro ? "text-[#907AFF]" : "text-slate-600 dark:text-white/60"}`}>
        {value}
      </span>
    );
  }
  if (value) {
    return (
      <span
        className="inline-flex h-6 w-6 items-center justify-center rounded-full"
        style={{ background: isPro ? `${BRAND_COLORS.violet}20` : "rgba(0,0,0,0.04)" }}
      >
        <Check
          className="h-3.5 w-3.5"
          style={{ color: isPro ? BRAND_COLORS.violet : "#94a3b8" }}
          strokeWidth={2.5}
        />
      </span>
    );
  }
  return <Minus className="h-4 w-4 text-slate-200 dark:text-white/15" />;
}

function FaqItem({ q, a, idx }: { q: string; a: string; idx: number }) {
  const [open, setOpen] = useState(false);

  return (
    <Reveal delay={idx * 40}>
      <div className="border-b border-black/[0.06] dark:border-white/[0.07]">
        <button
          onClick={() => setOpen((v) => !v)}
          className="group flex w-full items-center justify-between gap-4 py-5 text-left"
          aria-expanded={open}
        >
          <span className="text-[15px] font-medium text-slate-900 dark:text-white">{q}</span>
          <span
            className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-black/[0.08] bg-white transition-all duration-300 dark:border-white/[0.10] dark:bg-white/[0.04] ${open ? "rotate-45" : ""}`}
          >
            <svg className="h-3 w-3 text-slate-500 dark:text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </span>
        </button>
        <div
          className="overflow-hidden transition-all duration-300 ease-in-out"
          style={{ maxHeight: open ? 240 : 0 }}
        >
          <p className="pb-5 text-[14px] leading-[1.7] text-slate-500 dark:text-white/50">{a}</p>
        </div>
      </div>
    </Reveal>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PricingPage() {
  const [annual, setAnnual] = useState(false);
  const proMonthly = 29;
  const proAnnualPerMonth = 19;
  const displayPrice = annual ? proAnnualPerMonth : proMonthly;

  return (
    <main className="author-light relative min-h-screen bg-background text-foreground -mt-[88px]">
      {/* ── Hero ── */}
      <section className="relative isolate flex flex-col items-center overflow-hidden px-6 pb-0 pt-[148px] text-center">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-[8%] h-[600px] w-[600px] -translate-x-1/2 rounded-full blur-[160px]" style={{ background: BRAND_COLORS.violet, opacity: 0.08 }} />
          <div className="absolute right-[5%] top-[40%] h-[360px] w-[360px] rounded-full blur-[120px]" style={{ background: BRAND_COLORS.rose, opacity: 0.06 }} />
          <div className="absolute inset-0 bg-gradient-to-b from-background via-transparent to-background" />
        </div>

        <div className="hero-animate-down mb-6 inline-flex items-center gap-2 rounded-full border border-black/[0.08] bg-white/80 px-4 py-1.5 backdrop-blur-xl dark:border-white/[0.12] dark:bg-white/[0.04]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#907AFF]" />
          <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-slate-600 dark:text-white/60">Simple pricing</span>
        </div>

        <h1 className="hero-animate mx-auto max-w-[640px] text-[clamp(40px,5.5vw,72px)] font-semibold leading-[0.96] tracking-[-0.04em] text-slate-900 dark:text-white" style={{ animationDelay: "120ms" }}>
          One plan.{" "}
          <BrandGradientText>Every AI tool.</BrandGradientText>
        </h1>

        <p className="hero-animate mx-auto mt-5 max-w-[440px] text-[17px] leading-[1.6] text-slate-500 dark:text-white/50" style={{ animationDelay: "220ms" }}>
          Start free. Upgrade when you need AI translation, audiobooks, and the full author OS.
        </p>

        {/* Annual toggle */}
        <div className="hero-animate mt-9 flex items-center gap-3" style={{ animationDelay: "340ms" }}>
          <span className={`text-[13px] font-medium ${!annual ? "text-slate-900 dark:text-white" : "text-slate-400 dark:text-white/35"}`}>Monthly</span>
          <button
            onClick={() => setAnnual(v => !v)}
            className={`relative h-6 w-11 rounded-full transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#907AFF]/50 ${annual ? "bg-[#907AFF]" : "bg-slate-200 dark:bg-white/10"}`}
            aria-label="Toggle annual billing"
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-300 ${annual ? "translate-x-5" : "translate-x-0.5"}`} />
          </button>
          <span className={`text-[13px] font-medium ${annual ? "text-slate-900 dark:text-white" : "text-slate-400 dark:text-white/35"}`}>Annual</span>
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-all duration-300 ${annual ? "bg-[#907AFF]/10 text-[#907AFF] opacity-100 dark:bg-[#907AFF]/20" : "opacity-0"}`}>
            Save 35%
          </span>
        </div>
      </section>

      {/* ── Plan cards ── */}
      <section className="mx-auto mt-12 w-full max-w-[900px] px-6">
        <div className="grid gap-4 md:grid-cols-2">

          {/* Free */}
          <Reveal>
            <div className="flex h-full flex-col rounded-[28px] border border-black/[0.06] bg-white/70 p-8 backdrop-blur-sm dark:border-white/[0.07] dark:bg-white/[0.025]">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-white/35">Free</p>
                <div className="mt-4 flex items-end gap-1.5">
                  <span className="text-[52px] font-semibold leading-none tracking-[-0.05em] text-slate-900 dark:text-white">$0</span>
                  <span className="mb-2 text-[14px] text-slate-400 dark:text-white/35">/month</span>
                </div>
                <p className="mt-3 text-[14px] leading-[1.6] text-slate-500 dark:text-white/45">Everything you need to start writing and publishing.</p>
              </div>

              <div className="my-7 h-px bg-black/[0.05] dark:bg-white/[0.06]" />

              <ul className="flex-1 space-y-3.5">
                {["Up to 3 books", "Rich text editor", "Publishing tools", "Basic analytics", "Community support"].map((f) => (
                  <li key={f} className="flex items-center gap-3 text-[14px] text-slate-600 dark:text-white/65">
                    <Check className="h-4 w-4 flex-shrink-0 text-slate-300 dark:text-white/25" strokeWidth={2.5} />
                    {f}
                  </li>
                ))}
              </ul>

              <Link href="/author/signup" className="mt-8 block rounded-full border border-black/[0.08] bg-white/80 px-6 py-3 text-center text-[14px] font-semibold text-slate-700 transition-all duration-200 hover:border-black/[0.14] hover:text-slate-900 dark:border-white/[0.10] dark:bg-white/[0.04] dark:text-white/65 dark:hover:text-white">
                Start for free
              </Link>
            </div>
          </Reveal>

          {/* Pro */}
          <Reveal delay={80}>
            {/* Gradient border wrapper */}
            <div className="h-full rounded-[30px] p-[1.5px]" style={{ background: "linear-gradient(135deg, #907AFF 0%, #E29ED5 55%, #FCC997 100%)" }}>
              <div className="relative flex h-full flex-col overflow-hidden rounded-[28.5px] bg-[#0f0c24] p-8">
                {/* Inner ambient glow */}
                <div className="pointer-events-none absolute -left-16 -top-16 h-[280px] w-[280px] rounded-full blur-[100px]" style={{ background: BRAND_COLORS.violet, opacity: 0.25 }} />
                <div className="pointer-events-none absolute -bottom-12 -right-12 h-[200px] w-[200px] rounded-full blur-[80px]" style={{ background: BRAND_COLORS.rose, opacity: 0.15 }} />

                <div className="relative flex items-start justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907AFF]">Pro</p>
                    <div className="mt-4 flex items-end gap-1.5">
                      <span className="text-[52px] font-semibold leading-none tracking-[-0.05em] text-white">
                        ${displayPrice}
                      </span>
                      <span className="mb-2 text-[14px] text-white/40">/month</span>
                    </div>
                    {annual && (
                      <p className="mt-1 text-[12px] text-white/35">Billed ${proAnnualPerMonth * 12}/year</p>
                    )}
                    <p className="mt-3 text-[14px] leading-[1.6] text-white/50">Full AI suite — translation, audio, video, marketing.</p>
                  </div>
                  <span className="rounded-full bg-[#907AFF]/20 px-3 py-1 text-[11px] font-semibold text-[#c4a8ff] ring-1 ring-[#907AFF]/30">Most popular</span>
                </div>

                <div className="relative my-7 h-px bg-white/[0.08]" />

                <ul className="relative flex-1 space-y-3.5">
                  {[
                    "Everything in Free",
                    "Unlimited books",
                    "AI translation (20+ languages)",
                    "Audiobook generation",
                    "AI marketing campaigns",
                    "Book trailer (AI video)",
                    "Advanced analytics & map",
                    "Priority support",
                  ].map((f) => (
                    <li key={f} className="flex items-center gap-3 text-[14px] text-white/80">
                      <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-[#907AFF]/20">
                        <Check className="h-2.5 w-2.5 text-[#907AFF]" strokeWidth={3} />
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>

                <Link
                  href="/author/signup"
                  className="relative mt-8 block rounded-full px-6 py-3.5 text-center text-[14px] font-semibold text-white transition-all duration-200 hover:opacity-90"
                  style={{ background: "linear-gradient(135deg, #907AFF 0%, #c894e6 100%)", boxShadow: "0 8px 32px rgba(144,122,255,0.35)" }}
                >
                  Get Pro
                </Link>
              </div>
            </div>
          </Reveal>
        </div>

        {/* Guarantee line */}
        <Reveal delay={120}>
          <p className="mt-5 text-center text-[12px] text-slate-400 dark:text-white/25">
            No credit card required to start · Cancel anytime · Instant access
          </p>
        </Reveal>
      </section>

      {/* ── Feature comparison table ── */}
      <section className="mx-auto mt-24 w-full max-w-[900px] px-6">
        <Reveal>
          <div className="mb-2 text-center">
            <p className="text-[11px] font-medium uppercase tracking-[0.15em] text-[#907AFF]">Full comparison</p>
            <h2 className="mt-3 text-[clamp(24px,3vw,36px)] font-semibold tracking-[-0.03em] text-slate-900 dark:text-white">
              Everything, side by side
            </h2>
          </div>
        </Reveal>

        <Reveal delay={60}>
          <div className="mt-10 overflow-hidden rounded-[24px] border border-black/[0.05] bg-white/70 shadow-[0_4px_32px_rgba(15,23,42,0.05)] backdrop-blur-sm dark:border-white/[0.07] dark:bg-white/[0.025]">
            {/* Sticky header */}
            <div className="grid grid-cols-3 border-b border-black/[0.05] dark:border-white/[0.07]">
              <div className="px-6 py-4">
                <span className="text-[12px] font-medium text-slate-400 dark:text-white/30">Feature</span>
              </div>
              <div className="flex items-center justify-center border-l border-black/[0.04] px-6 py-4 dark:border-white/[0.05]">
                <span className="text-[12px] font-semibold text-slate-500 dark:text-white/40">Free</span>
              </div>
              {/* Pro column header */}
              <div className="flex items-center justify-center border-l px-6 py-4" style={{ borderColor: `${BRAND_COLORS.violet}20`, background: `${BRAND_COLORS.violet}06` }}>
                <span className="text-[12px] font-semibold" style={{ color: BRAND_COLORS.violet }}>Pro</span>
              </div>
            </div>

            {/* Groups */}
            {FEATURE_GROUPS.map((group, gi) => (
              <div key={group.label}>
                {/* Group label */}
                <div className="border-b border-black/[0.04] bg-slate-50/60 px-6 py-2.5 dark:border-white/[0.05] dark:bg-white/[0.015]">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-white/25">{group.label}</span>
                </div>
                {group.rows.map((row, ri) => (
                  <div
                    key={row.label}
                    className={`grid grid-cols-3 items-center ${ri < group.rows.length - 1 || gi < FEATURE_GROUPS.length - 1 ? "border-b border-black/[0.04] dark:border-white/[0.05]" : ""}`}
                  >
                    <div className="px-6 py-4">
                      <span className="text-[13px] text-slate-700 dark:text-white/65">{row.label}</span>
                    </div>
                    <div className="flex items-center justify-center border-l border-black/[0.04] px-6 py-4 dark:border-white/[0.05]">
                      <FeatureCell value={row.free} />
                    </div>
                    <div className="flex items-center justify-center border-l px-6 py-4" style={{ borderColor: `${BRAND_COLORS.violet}15`, background: `${BRAND_COLORS.violet}04` }}>
                      <FeatureCell value={row.pro} isPro />
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* ── FAQ ── */}
      <section className="mx-auto mt-24 w-full max-w-[680px] px-6">
        <Reveal>
          <div className="mb-10 text-center">
            <p className="text-[11px] font-medium uppercase tracking-[0.15em] text-[#907AFF]">FAQ</p>
            <h2 className="mt-3 text-[clamp(24px,3vw,36px)] font-semibold tracking-[-0.03em] text-slate-900 dark:text-white">Common questions</h2>
          </div>
        </Reveal>
        <div>
          {FAQS.map((item, i) => (
            <FaqItem key={item.q} q={item.q} a={item.a} idx={i} />
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="mx-auto mt-24 w-full max-w-[900px] px-6 pb-28">
        <Reveal>
          <div className="relative overflow-hidden rounded-[32px] px-10 py-16 text-center" style={{ background: "#0b0819" }}>
            <div className="pointer-events-none absolute -left-16 -top-16 h-[320px] w-[320px] rounded-full blur-[100px]" style={{ background: BRAND_COLORS.violet, opacity: 0.28 }} />
            <div className="pointer-events-none absolute -bottom-16 -right-16 h-[260px] w-[260px] rounded-full blur-[100px]" style={{ background: BRAND_COLORS.rose, opacity: 0.18 }} />
            {/* Gradient border */}
            <div className="pointer-events-none absolute inset-0 rounded-[32px] ring-1 ring-inset" style={{ background: "linear-gradient(135deg, rgba(144,122,255,0.3) 0%, rgba(226,158,213,0.15) 100%)", WebkitMaskImage: "linear-gradient(#fff 0 0)", maskMode: "luminance", WebkitMaskComposite: "destination-in" }} />

            <div className="relative">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/30">Get started today</p>
              <h2 className="mt-4 text-[clamp(28px,3.5vw,48px)] font-semibold leading-[1.05] tracking-[-0.04em] text-white">
                Your first book is free.{" "}
                <span className="bg-[linear-gradient(110deg,#907AFF_0%,#E29ED5_55%,#FCC997_100%)] bg-clip-text text-transparent">
                  Always.
                </span>
              </h2>
              <p className="mx-auto mt-5 max-w-[380px] text-[15px] leading-[1.65] text-white/40">
                Sign up in seconds. No credit card required. Add Pro when you&apos;re ready to scale.
              </p>
              <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                <Link
                  href="/author/signup"
                  className="rounded-full bg-white px-8 py-3.5 text-[14px] font-semibold text-slate-900 transition-all duration-200 hover:bg-white/90 sm:min-w-[180px]"
                >
                  Start for free
                </Link>
                <Link
                  href="/how-it-works"
                  className="rounded-full border border-white/[0.10] bg-white/[0.06] px-8 py-3.5 text-[14px] font-semibold text-white/60 transition-all duration-200 hover:bg-white/[0.10] hover:text-white sm:min-w-[180px]"
                >
                  See how it works
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </section>
    </main>
  );
}
