"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import Reveal from "@/components/Reveal";
import { BRAND_COLORS } from "@/lib/design/brand";

const CATEGORIES = [
  {
    label: "Getting started",
    items: [
      {
        q: "What is Verkli?",
        a: "Verkli is an author OS — a platform where you write, publish, and grow your readership. It gives you a rich writing editor, AI tools for translation and audiobook generation, marketing automation, and a reader-facing app, all in one place.",
      },
      {
        q: "Is Verkli free to use?",
        a: "Yes. The Free plan lets you write and publish up to three books with no credit card required. Upgrade to Pro when you want AI translation, audiobook generation, and the full feature set.",
      },
      {
        q: "Do I need to be a published author to sign up?",
        a: "Not at all. Verkli is built for writers at every stage — from first drafts to established publishing careers.",
      },
    ],
  },
  {
    label: "Writing & publishing",
    items: [
      {
        q: "What does the editor support?",
        a: "The editor supports rich text with headings, paragraphs, lists, block quotes, and code blocks. It auto-saves as you type and handles multiple chapters per book.",
      },
      {
        q: "Can I have multiple versions of a book?",
        a: "Yes. With Verkli Pro you can have multiple book versions — for example, an original English edition and translated editions in French, Spanish, German, and more.",
      },
      {
        q: "How do I publish a book?",
        a: "Set a title, cover, and genre, then mark your book as published. Readers can discover your work through the Verkli reader app immediately.",
      },
    ],
  },
  {
    label: "AI features",
    items: [
      {
        q: "How does AI translation work?",
        a: "Select a book version and choose a target language. Verkli translates every chapter using a production-grade AI pipeline. The result is a fully separate book version — ready to read, edit, and publish.",
      },
      {
        q: "Which languages does translation support?",
        a: "Verkli supports 20+ languages including Swedish, English, French, Spanish, German, Italian, Portuguese, Dutch, Polish, Japanese, and more.",
      },
      {
        q: "What is audiobook generation?",
        a: "Pick a voice and Verkli generates a full audio version of your book, chapter by chapter. You can listen to the preview in the editor, download files, or publish it alongside your text edition.",
      },
      {
        q: "What are AI marketing campaigns?",
        a: "Verkli can generate social media copy, email newsletters, and promotional content for your book — tailored to your genre and audience — from inside the editor.",
      },
    ],
  },
  {
    label: "Billing",
    items: [
      {
        q: "What is included in the Pro plan?",
        a: "Pro includes unlimited books, AI translation, audiobook generation, AI marketing campaigns, book trailers, advanced analytics, multiple book versions, and priority support.",
      },
      {
        q: "Can I cancel anytime?",
        a: "Yes. Cancel from your billing settings at any time. You keep Pro access until the end of the current billing period.",
      },
      {
        q: "Is there an annual discount?",
        a: "Yes — annual billing saves you roughly 35% compared to monthly. You can switch between billing periods in your account settings.",
      },
    ],
  },
];

function FaqItem({ q, a, delay }: { q: string; a: string; delay: number }) {
  const [open, setOpen] = useState(false);
  return (
    <Reveal delay={delay}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full border-b border-slate-100 py-5 text-left dark:border-white/[0.07] last:border-0"
        aria-expanded={open}
      >
        <div className="flex items-start justify-between gap-4">
          <span className="text-[15px] font-medium leading-snug text-slate-900 dark:text-white">{q}</span>
          <ChevronDown
            className={`mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400 transition-transform duration-300 dark:text-white/30 ${open ? "rotate-180" : ""}`}
          />
        </div>
        {open && (
          <p className="mt-3 pr-8 text-[14px] leading-relaxed text-slate-500 dark:text-white/50">{a}</p>
        )}
      </button>
    </Reveal>
  );
}

export default function FaqPage() {
  return (
    <main className="relative min-h-screen bg-background text-foreground -mt-[88px]">
      {/* ── Hero ── */}
      <section className="relative isolate flex flex-col items-center overflow-hidden px-6 pb-0 pt-[136px] text-center">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div
            className="absolute left-1/2 top-[5%] h-[400px] w-[400px] -translate-x-1/2 rounded-full blur-[120px]"
            style={{ background: BRAND_COLORS.violet, opacity: 0.09 }}
          />
        </div>

        <div className="hero-animate-down mb-6 inline-flex items-center gap-2 rounded-full border border-black/[0.08] bg-white/80 px-4 py-1.5 backdrop-blur-xl dark:border-white/[0.12] dark:bg-white/[0.04]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#907AFF]" />
          <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-slate-600 dark:text-white/60">
            Help center
          </span>
        </div>

        <h1 className="hero-animate max-w-[560px] text-[clamp(36px,5vw,60px)] font-semibold leading-[0.97] tracking-[-0.04em] text-slate-900 dark:text-white" style={{ animationDelay: "120ms" }}>
          Frequently asked questions
        </h1>
        <p className="hero-animate mx-auto mt-5 max-w-[400px] text-[16px] leading-relaxed text-slate-500 dark:text-white/50" style={{ animationDelay: "220ms" }}>
          Can&apos;t find what you&apos;re looking for? Reach out and we&apos;ll help.
        </p>
      </section>

      {/* ── FAQ sections ── */}
      <section className="mx-auto mt-16 w-full max-w-2xl px-6 pb-24">
        <div className="space-y-10">
          {CATEGORIES.map((cat, ci) => (
            <div key={cat.label}>
              <Reveal delay={ci * 40}>
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#907AFF]">
                  {cat.label}
                </p>
              </Reveal>
              <div className="rounded-2xl border border-slate-200/60 bg-white/80 px-6 shadow-[0_4px_16px_rgba(15,23,42,0.04)] dark:border-white/[0.08] dark:bg-white/[0.02]">
                {cat.items.map((item, ii) => (
                  <FaqItem key={item.q} q={item.q} a={item.a} delay={ci * 40 + ii * 30} />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Still have questions */}
        <Reveal delay={120}>
          <div className="mt-14 rounded-3xl border border-slate-200/70 bg-white/80 p-8 text-center shadow-[0_4px_16px_rgba(15,23,42,0.04)] dark:border-white/[0.08] dark:bg-white/[0.02]">
            <p className="text-[15px] font-medium text-slate-900 dark:text-white">Still have questions?</p>
            <p className="mt-1 text-[14px] text-slate-500 dark:text-white/50">We&apos;re happy to help you get started.</p>
            <div className="mt-5 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link
                href="/author/signup"
                className="btn-primary rounded-full bg-slate-900 px-6 py-2.5 text-[14px] font-semibold text-white hover:bg-slate-800 dark:bg-[#907AFF] dark:hover:bg-[#8069EE]"
              >
                Create account
              </Link>
              <Link
                href="/pricing"
                className="rounded-full border border-slate-200 px-6 py-2.5 text-[14px] font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900 dark:border-white/10 dark:text-white/60 dark:hover:text-white"
              >
                View pricing
              </Link>
            </div>
          </div>
        </Reveal>
      </section>
    </main>
  );
}
