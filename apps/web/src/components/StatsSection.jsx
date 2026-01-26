"use client";

export default function StatsSection() {
  const stats = [
    {
      value: "300K+",
      label: "Published books"
    },
    {
      value: "10",
      label: "Marketing platforms"
    },
    {
      value: "2M+",
      label: "active readers"
    }
  ];

  return (
    <section className="relative mx-auto flex w-full max-w-[1400px] flex-col items-center gap-24 px-6 py-24 lg:gap-[200px] lg:px-[115px] lg:py-[200px]">
      <h2 className="max-w-[1028px] text-center text-3xl font-normal leading-[120%] text-[#F7F7F7] md:text-4xl lg:text-[55px]">
        Grow faster with social, blog, video, and newsletter content that converts.
      </h2>

      <div className="relative w-full">
        <div className="flex w-full flex-col items-center justify-between gap-12 md:flex-row md:gap-8 lg:w-[1116px] lg:mx-auto">
          {stats.map((stat, index) => (
            <div
              key={index}
              className="flex flex-col items-center gap-6 lg:gap-[25px]"
            >
              <div className="text-center text-6xl font-medium leading-[120%] text-[#F7F7F7] md:text-7xl lg:text-[96px]">
                {stat.value}
              </div>
              <div className="w-full max-w-[297px] text-center text-lg font-normal uppercase leading-[140%] text-[#F7F7F7] md:text-xl lg:text-[23px]">
                {stat.label}
              </div>
            </div>
          ))}
        </div>

        {/* Decorative circle */}
        <div className="pointer-events-none absolute -bottom-24 right-0 hidden h-[375px] w-[375px] overflow-hidden rounded-full bg-transparent shadow-[inset_-11px_-18px_75px_0_rgba(0,0,0,0.15)] lg:block"></div>
      </div>
    </section>
  );
}
