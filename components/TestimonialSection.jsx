"use client";

import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';

export default function TestimonialSection() {
  const avatarsRef = useRef([]);
  const sectionRef = useRef(null);

  useEffect(() => {
    // Intersection Observer för att trigga animation när sektionen är synlig
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            // Animera in alla avatarer med stagger
            gsap.fromTo(
              avatarsRef.current,
              {
                scale: 0,
                opacity: 0,
              },
              {
                scale: 1,
                opacity: 1,
                duration: 0.6,
                ease: 'back.out(1.7)',
                stagger: {
                  amount: 0.8,
                  from: 'center',
                  grid: 'auto',
                },
              }
            );
            // Avregistrera efter första gången
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.2 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <section ref={sectionRef} className="mx-auto flex w-full max-w-[1400px] flex-col items-center gap-[75px] px-6 py-[50px] lg:px-[115px]">
      <h2 className="text-center text-4xl font-medium leading-normal text-[#F7F7F7] md:text-5xl lg:text-[64px]">
        Hear what our writers say
      </h2>

      <div className="flex flex-col items-center gap-[19px]">
        <div className="flex flex-wrap justify-center items-start gap-8 md:gap-12 lg:gap-[76px]">
          <div ref={el => avatarsRef.current[0] = el} className="h-16 w-16 flex-shrink-0 rounded-full bg-white/10 md:h-20 md:w-20 lg:h-24 lg:w-24"></div>
          <div ref={el => avatarsRef.current[1] = el} className="h-16 w-16 flex-shrink-0 rounded-full bg-white/10 md:h-20 md:w-20 lg:h-24 lg:w-24"></div>
          <div ref={el => avatarsRef.current[2] = el} className="h-16 w-16 flex-shrink-0 rounded-full bg-white/10 md:h-20 md:w-20 lg:h-24 lg:w-24"></div>
          <div ref={el => avatarsRef.current[3] = el} className="h-16 w-16 flex-shrink-0 rounded-full bg-white/10 md:h-20 md:w-20 lg:h-24 lg:w-24"></div>
          <div ref={el => avatarsRef.current[4] = el} className="h-16 w-16 flex-shrink-0 rounded-full bg-white/10 md:h-20 md:w-20 lg:h-24 lg:w-24"></div>
        </div>
        <div className="flex flex-wrap justify-center items-start gap-8 md:gap-12 lg:gap-[76px]">
          <div ref={el => avatarsRef.current[5] = el} className="h-16 w-16 flex-shrink-0 rounded-full bg-white/10 md:h-20 md:w-20 lg:h-24 lg:w-24"></div>
          <div ref={el => avatarsRef.current[6] = el} className="h-16 w-16 flex-shrink-0 rounded-full bg-white/10 md:h-20 md:w-20 lg:h-24 lg:w-24"></div>
          <div ref={el => avatarsRef.current[7] = el} className="h-16 w-16 flex-shrink-0 rounded-full bg-white/10 md:h-20 md:w-20 lg:h-24 lg:w-24"></div>
          <div ref={el => avatarsRef.current[8] = el} className="h-16 w-16 flex-shrink-0 rounded-full bg-white/10 md:h-20 md:w-20 lg:h-24 lg:w-24"></div>
        </div>
      </div>

      <div className="flex flex-col items-center gap-8 rounded-[39px] px-6 py-12 md:gap-[38px] md:px-10 md:py-[58px]">
        <blockquote className="max-w-[707px] text-center text-lg font-normal leading-normal text-[#F7F7F7] md:text-2xl lg:text-[28px]">
          "I've worked with publishers, marketing teams, and digital consultants for years. Verkli is the first platform that treats the book itself as the source of truth rather than an asset to be fragmented."
        </blockquote>
        <cite className="text-lg font-medium not-italic text-[#F7F7F7] md:text-2xl lg:text-[28px]">
          - Jane Doe
        </cite>
      </div>
    </section>
  );
}
