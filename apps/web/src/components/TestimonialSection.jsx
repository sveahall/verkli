"use client";

import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';

const testimonials = [
  {
    name: "Emma Richardson",
    role: "NYT Bestselling Author",
    image: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&h=120&fit=crop&crop=face",
    quote: "Verkli transformed how I connect with readers. My content reaches 10x more people now.",
    color: "#907AFF",
  },
  {
    name: "Marcus Chen",
    role: "Indie Author",
    image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&h=120&fit=crop&crop=face",
    quote: "Finally, a platform that understands what authors actually need.",
    color: "#E29ED5",
  },
  {
    name: "Sofia Martinez",
    role: "Romance author",
    image: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=120&h=120&fit=crop&crop=face",
    quote: "The time I save on marketing I now spend writing my next book.",
    color: "#FCC997",
  },
];

export default function TestimonialSection() {
  const cardsRef = useRef([]);
  const sectionRef = useRef(null);
  const [hoveredIndex, setHoveredIndex] = useState(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            gsap.fromTo(
              cardsRef.current,
              { y: 50, opacity: 0, scale: 0.95 },
              {
                y: 0,
                opacity: 1,
                scale: 1,
                duration: 0.8,
                ease: 'power3.out',
                stagger: 0.1,
              }
            );
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
    <section ref={sectionRef} className="relative mx-auto w-full max-w-[1200px] px-6 py-24">
      {/* Large background glow */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-[500px] w-[700px] rounded-full bg-gradient-to-r from-[#907AFF]/10 via-[#E29ED5]/8 to-[#FCC997]/10 blur-[150px]" />
      </div>

      <div className="relative text-center">
        <p className="text-[13px] font-medium uppercase tracking-wider text-[#907AFF]">Testimonials</p>
        <h2 className="mt-4 text-[40px] font-semibold leading-[1.1] tracking-[-0.02em] text-slate-900 dark:text-white md:text-[52px]">
          Loved by authors
          <br />
          <span className="bg-gradient-to-r from-[#907AFF] via-[#E29ED5] to-[#FCC997] bg-clip-text text-transparent">everywhere.</span>
        </h2>
      </div>

      <div className="relative mt-16 grid gap-5 md:grid-cols-3">
        {testimonials.map((testimonial, index) => (
          <div
            key={index}
            ref={el => cardsRef.current[index] = el}
            onMouseEnter={() => setHoveredIndex(index)}
            onMouseLeave={() => setHoveredIndex(null)}
            className="group relative overflow-hidden rounded-[28px] border border-black/10 bg-gradient-to-b from-black/5 to-black/5 p-7 transition-all duration-500 hover:-translate-y-2 hover:border-black/20 dark:border-white/[0.08] dark:from-white/[0.06] dark:to-white/[0.02] dark:hover:border-white/[0.15]"
          >
            {/* Animated glow */}
            <div 
              className="pointer-events-none absolute -inset-px rounded-[28px] opacity-0 transition-opacity duration-500 group-hover:opacity-100"
              style={{ 
                background: `radial-gradient(400px circle at 50% 0%, ${testimonial.color}15, transparent 70%)`,
              }}
            />
            
            {/* Quote mark */}
            <div className="relative mb-5">
              <svg 
                className="h-8 w-8 transition-transform duration-500 group-hover:scale-110" 
                style={{ color: testimonial.color }}
                fill="currentColor" 
                viewBox="0 0 24 24"
              >
                <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
              </svg>
            </div>
            
            <p className="relative text-[17px] leading-[1.7] text-slate-600 transition-colors duration-300 group-hover:text-slate-800 dark:text-white/80 dark:group-hover:text-white/90">
              "{testimonial.quote}"
            </p>
            
            <div className="relative mt-8 flex items-center gap-4">
              <div className="relative">
                <img
                  src={testimonial.image}
                  alt={testimonial.name}
                  className="h-12 w-12 rounded-full object-cover ring-2 ring-black/10 transition-all duration-300 group-hover:ring-4 dark:ring-white/10"
                  style={{ '--tw-ring-color': hoveredIndex === index ? `${testimonial.color}40` : 'rgba(255,255,255,0.1)' }}
                />
              </div>
              <div>
                <div className="text-[15px] font-medium text-slate-900 dark:text-white">{testimonial.name}</div>
                <div className="text-[13px] text-slate-500 dark:text-white/40">{testimonial.role}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
