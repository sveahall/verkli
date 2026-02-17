"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import BrandGradientText from "@/components/ui/brand-gradient-text";

const testimonials = [
  {
    name: "Emma Richardson",
    role: "NYT Bestselling Author",
    image:
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&h=120&fit=crop&crop=face",
    quote:
      "Verkli transformed how I connect with readers. My content reaches 10x more people now.",
    color: "#907AFF",
  },
  {
    name: "Marcus Chen",
    role: "Indie Author",
    image:
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&h=120&fit=crop&crop=face",
    quote:
      "Finally, a platform that understands what authors actually need.",
    color: "#E29ED5",
  },
  {
    name: "Sofia Martinez",
    role: "Romance author",
    image:
      "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=120&h=120&fit=crop&crop=face",
    quote:
      "The time I save on marketing I now spend writing my next book.",
    color: "#FCC997",
  },
];

export default function TestimonialSection() {
  const cardsRef = useRef([]);
  const sectionRef = useRef(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setRevealed(true);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative mx-auto w-full max-w-[1200px] px-6 py-24"
    >
      <div className="text-center">
        <p className="text-[13px] font-medium uppercase tracking-[0.15em] text-[#907AFF]">
          Testimonials
        </p>
        <h2 className="mt-4 text-[clamp(28px,4vw,48px)] font-semibold leading-[1.1] tracking-[-0.025em] text-slate-900 dark:text-white">
          Loved by authors{" "}
          <BrandGradientText>
            everywhere.
          </BrandGradientText>
        </h2>
      </div>

      <div className="mt-16 grid gap-5 md:grid-cols-3">
        {testimonials.map((testimonial, index) => (
          <div
            key={index}
            ref={(el) => (cardsRef.current[index] = el)}
            className={`group relative overflow-hidden rounded-[24px] border border-black/[0.06] bg-gradient-to-br from-black/[0.04] to-transparent p-8 transition-all duration-500 hover:-translate-y-2 hover:border-black/[0.1] hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)] dark:border-white/[0.08] dark:from-white/[0.04] dark:to-transparent dark:hover:border-white/[0.14] dark:hover:shadow-[0_12px_40px_rgba(0,0,0,0.3)] ${
              revealed
                ? "translate-y-0 opacity-100"
                : "translate-y-6 opacity-0"
            }`}
            style={{
              transitionDelay: revealed ? `${index * 100}ms` : "0ms",
            }}
          >
            {/* Hover glow circle */}
            <div
              className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100"
              style={{ backgroundColor: `${testimonial.color}25` }}
            />

            {/* Quote mark */}
            <div className="relative mb-5">
              <svg
                className="h-7 w-7"
                style={{ color: testimonial.color }}
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
              </svg>
            </div>

            <p className="relative text-[16px] leading-[1.7] text-slate-500 dark:text-white/45">
              &quot;{testimonial.quote}&quot;
            </p>

            <div className="relative mt-8 flex items-center gap-4">
              <Image
                src={testimonial.image}
                alt={testimonial.name}
                width={44}
                height={44}
                sizes="44px"
                className="h-11 w-11 rounded-full object-cover ring-2 ring-black/[0.04] dark:ring-white/[0.08]"
              />
              <div>
                <div className="text-[15px] font-medium text-slate-900 dark:text-white">
                  {testimonial.name}
                </div>
                <div className="text-[13px] text-slate-400 dark:text-white/35">
                  {testimonial.role}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
