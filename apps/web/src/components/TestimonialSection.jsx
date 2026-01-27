"use client";

export default function TestimonialSection() {
  return (
    <section className="mx-auto flex w-full max-w-[1400px] flex-col items-center gap-[75px] px-6 py-[50px] lg:px-[115px]">
      <h2 className="text-center text-4xl font-medium leading-normal text-slate-900 dark:text-[#F7F7F7] md:text-5xl lg:text-[64px]">
        Hear what our writers say
      </h2>

      <div className="flex flex-col items-center gap-[19px]">
        <div className="flex flex-wrap justify-center items-start gap-8 md:gap-12 lg:gap-[76px]">
          <div className="h-16 w-16 flex-shrink-0 rounded-full bg-black/5 dark:bg-white/10 md:h-20 md:w-20 lg:h-24 lg:w-24"></div>
          <div className="h-16 w-16 flex-shrink-0 rounded-full bg-black/5 dark:bg-white/10 md:h-20 md:w-20 lg:h-24 lg:w-24"></div>
          <div className="h-16 w-16 flex-shrink-0 rounded-full bg-black/5 dark:bg-white/10 md:h-20 md:w-20 lg:h-24 lg:w-24"></div>
          <div className="h-16 w-16 flex-shrink-0 rounded-full bg-black/5 dark:bg-white/10 md:h-20 md:w-20 lg:h-24 lg:w-24"></div>
          <div className="h-16 w-16 flex-shrink-0 rounded-full bg-black/5 dark:bg-white/10 md:h-20 md:w-20 lg:h-24 lg:w-24"></div>
        </div>
        <div className="flex flex-wrap justify-center items-start gap-8 md:gap-12 lg:gap-[76px]">
          <div className="h-16 w-16 flex-shrink-0 rounded-full bg-black/5 dark:bg-white/10 md:h-20 md:w-20 lg:h-24 lg:w-24"></div>
          <div className="h-16 w-16 flex-shrink-0 rounded-full bg-black/5 dark:bg-white/10 md:h-20 md:w-20 lg:h-24 lg:w-24"></div>
          <div className="h-16 w-16 flex-shrink-0 rounded-full bg-black/5 dark:bg-white/10 md:h-20 md:w-20 lg:h-24 lg:w-24"></div>
          <div className="h-16 w-16 flex-shrink-0 rounded-full bg-black/5 dark:bg-white/10 md:h-20 md:w-20 lg:h-24 lg:w-24"></div>
        </div>
      </div>

      <div className="flex flex-col items-center gap-8 rounded-[39px] px-6 py-12 md:gap-[38px] md:px-10 md:py-[58px]">
        <blockquote className="max-w-[707px] text-center text-lg font-normal leading-normal text-slate-600 dark:text-[#F7F7F7] md:text-2xl lg:text-[28px]">
          "I've worked with publishers, marketing teams, and digital consultants for years. Verkli is the first platform that treats the book itself as the source of truth rather than an asset to be fragmented."
        </blockquote>
        <cite className="text-lg font-medium not-italic text-slate-900 dark:text-[#F7F7F7] md:text-2xl lg:text-[28px]">
          - Jane Doe
        </cite>
      </div>
    </section>
  );
}
