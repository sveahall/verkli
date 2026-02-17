"use client";

import Image from "next/image";
import Link from "next/link";
import BrandGradientText from "@/components/ui/brand-gradient-text";

export default function InteractiveTestimonialSection() {
  return (
    <section className="relative mx-auto w-full max-w-[1200px] px-6 py-24">
      {/* Large gradient wrapper card */}
      <div className="relative overflow-hidden rounded-[32px] border border-black/[0.06] bg-gradient-to-br from-black/[0.03] via-transparent to-black/[0.02] p-10 md:p-14 dark:border-white/[0.08] dark:from-white/[0.04] dark:to-white/[0.02]">
        {/* Background glow blobs */}
        <div className="pointer-events-none absolute -left-32 -top-32 h-72 w-72 rounded-full bg-[#907AFF]/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -right-24 h-64 w-64 rounded-full bg-[#FCC997]/10 blur-3xl" />
        <div className="pointer-events-none absolute right-1/3 top-1/4 h-48 w-48 rounded-full bg-[#E29ED5]/8 blur-3xl" />

        <div className="relative grid gap-14 lg:grid-cols-2 lg:items-center">
          {/* Left — copy */}
          <div>
            <p className="text-[13px] font-medium uppercase tracking-[0.15em] text-[#907AFF]">
              Social proof
            </p>
            <h2 className="mt-4 text-[clamp(28px,4vw,48px)] font-semibold leading-[1.1] tracking-[-0.025em] text-slate-900 dark:text-white">
              Authors love{" "}
              <BrandGradientText>
                what we do.
              </BrandGradientText>
            </h2>
            <p className="mt-5 max-w-[400px] text-[16px] leading-[1.7] text-slate-500 dark:text-white/45">
              Join thousands of authors who use Verkli to turn their stories into
              content that reaches readers everywhere.
            </p>
            <div className="mt-8 flex items-center gap-5">
              <Link href="/author/signup" className="btn-primary">
                Start for free
              </Link>
              <a
                href="#"
                className="text-[14px] text-slate-400 underline underline-offset-4 transition-colors hover:text-slate-600 dark:text-white/40 dark:hover:text-white/60"
              >
                Read case studies
              </a>
            </div>
          </div>

          {/* Right — testimonial cards */}
          <div className="space-y-4">
            {/* Featured testimonial */}
            <div className="group relative overflow-hidden rounded-[24px] border border-black/[0.06] bg-gradient-to-br from-black/[0.04] to-transparent p-8 transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_8px_32px_rgba(0,0,0,0.06)] dark:border-white/[0.08] dark:from-white/[0.04] dark:to-transparent dark:hover:shadow-[0_8px_32px_rgba(0,0,0,0.25)]">
              {/* Hover glow */}
              <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-[#907AFF]/0 blur-3xl transition-all duration-500 group-hover:bg-[#907AFF]/15" />
              <p className="relative text-[18px] font-normal leading-[1.6] tracking-[-0.01em] text-slate-700 dark:text-white/80">
                &quot;Fable helped me turn one story into content that reached
                millions. The success has been incredible.&quot;
              </p>
              <div className="relative mt-6 flex items-center gap-4">
                <Image
                  src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&h=80&fit=crop&crop=face"
                  alt="Ariana Godoy"
                  width={44}
                  height={44}
                  sizes="44px"
                  className="h-11 w-11 rounded-full object-cover ring-2 ring-black/[0.04] dark:ring-white/[0.08]"
                />
                <div>
                  <div className="text-[15px] font-medium text-slate-900 dark:text-white">
                    Ariana Godoy
                  </div>
                  <div className="text-[13px] text-slate-400 dark:text-white/35">
                    Bestselling author
                  </div>
                </div>
              </div>
            </div>

            {/* Two smaller testimonials */}
            <div className="grid grid-cols-2 gap-4">
              <div className="group relative overflow-hidden rounded-[24px] border border-black/[0.06] bg-gradient-to-br from-black/[0.04] to-transparent p-6 transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_8px_32px_rgba(0,0,0,0.06)] dark:border-white/[0.08] dark:from-white/[0.04] dark:to-transparent dark:hover:shadow-[0_8px_32px_rgba(0,0,0,0.25)]">
                <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-[#E29ED5]/0 blur-2xl transition-all duration-500 group-hover:bg-[#E29ED5]/15" />
                <p className="relative text-[14px] leading-[1.7] text-slate-500 dark:text-white/45">
                  &quot;My launch stayed visible for weeks.&quot;
                </p>
                <div className="relative mt-4 flex items-center gap-3">
                  <Image
                    src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=60&h=60&fit=crop&crop=face"
                    alt="Sarah Chen"
                    width={32}
                    height={32}
                    sizes="32px"
                    className="h-8 w-8 rounded-full object-cover ring-2 ring-black/[0.04] dark:ring-white/[0.08]"
                  />
                  <div className="text-[13px] text-slate-400 dark:text-white/35">
                    Sarah Chen
                  </div>
                </div>
              </div>
              <div className="group relative overflow-hidden rounded-[24px] border border-black/[0.06] bg-gradient-to-br from-black/[0.04] to-transparent p-6 transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_8px_32px_rgba(0,0,0,0.06)] dark:border-white/[0.08] dark:from-white/[0.04] dark:to-transparent dark:hover:shadow-[0_8px_32px_rgba(0,0,0,0.25)]">
                <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-[#FCC997]/0 blur-2xl transition-all duration-500 group-hover:bg-[#FCC997]/15" />
                <p className="relative text-[14px] leading-[1.7] text-slate-500 dark:text-white/45">
                  &quot;BookTok finally clicked for me.&quot;
                </p>
                <div className="relative mt-4 flex items-center gap-3">
                  <Image
                    src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=60&h=60&fit=crop&crop=face"
                    alt="Mark Torres"
                    width={32}
                    height={32}
                    sizes="32px"
                    className="h-8 w-8 rounded-full object-cover ring-2 ring-black/[0.04] dark:ring-white/[0.08]"
                  />
                  <div className="text-[13px] text-slate-400 dark:text-white/35">
                    Mark Torres
                  </div>
                </div>
              </div>
            </div>

            {/* Stats bar */}
            <div className="flex items-center justify-between rounded-[24px] border border-black/[0.06] bg-gradient-to-r from-black/[0.04] via-transparent to-black/[0.04] px-6 py-5 dark:border-white/[0.08] dark:from-white/[0.04] dark:via-transparent dark:to-white/[0.04]">
              <div className="text-center">
                <div className="text-[20px] font-semibold tracking-tight text-slate-900 dark:text-white">
                  12,000+
                </div>
                <div className="mt-0.5 text-[11px] text-slate-400 dark:text-white/35">
                  authors
                </div>
              </div>
              <div className="h-8 w-px bg-black/[0.06] dark:bg-white/[0.08]" />
              <div className="text-center">
                <div className="text-[20px] font-semibold tracking-tight text-slate-900 dark:text-white">
                  4.9/5
                </div>
                <div className="mt-0.5 text-[11px] text-slate-400 dark:text-white/35">
                  rating
                </div>
              </div>
              <div className="h-8 w-px bg-black/[0.06] dark:bg-white/[0.08]" />
              <div className="text-center">
                <div className="text-[20px] font-semibold tracking-tight text-slate-900 dark:text-white">
                  89%
                </div>
                <div className="mt-0.5 text-[11px] text-slate-400 dark:text-white/35">
                  time saved
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
