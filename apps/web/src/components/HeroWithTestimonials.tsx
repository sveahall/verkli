export default function HeroWithTestimonials() {
  return (
    <section className="hero-testimonials relative flex min-h-screen items-center justify-center overflow-hidden bg-[#F5F5F5] px-6 py-20">
      {/* Large background text */}
      <h1 className="hero-title pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 whitespace-nowrap text-[clamp(80px,15vw,240px)] font-bold leading-none text-white/40">
        Into your book
        <br />
        into the world
      </h1>

      {/* Floating testimonial cards */}
      <div
        className="testimonial-card absolute right-[10%] top-[10%] max-w-[280px] rounded-[24px] bg-gradient-to-br from-[#5B5FCF] to-[#7B7FE8] p-6 text-white"
        style={{
          animation: "float 6s ease-in-out infinite",
        }}
      >
        <p className="testimonial-quote mb-3 text-[15px] leading-relaxed">
          &quot;Watching Through My Window succeed has been incredible and such a blessing.&quot;
        </p>
        <p className="testimonial-author text-right text-[14px] font-medium">
          - Ariana Godoy
        </p>
      </div>

      <div
        className="testimonial-card absolute right-[15%] top-[45%] max-w-[280px] rounded-[24px] bg-gradient-to-br from-[#6B6FDF] to-[#8B8FF8] p-6 text-white"
        style={{
          animation: "float 6s ease-in-out infinite 2s",
        }}
      >
        <p className="testimonial-quote mb-3 text-[15px] leading-relaxed">
          &quot;Watching Through My Window succeed has been incredible and such a blessing.&quot;
        </p>
        <p className="testimonial-author text-right text-[14px] font-medium">
          - Ariana Godoy
        </p>
      </div>

      <div
        className="testimonial-card absolute bottom-[10%] right-[8%] max-w-[280px] rounded-[24px] bg-gradient-to-br from-[#5B5FCF] to-[#7B7FE8] p-6 text-white"
        style={{
          animation: "float 6s ease-in-out infinite 4s",
        }}
      >
        <p className="testimonial-quote mb-3 text-[15px] leading-relaxed">
          &quot;Watching Through My Window succeed has been incredible and such a blessing.&quot;
        </p>
        <p className="testimonial-author text-right text-[14px] font-medium">
          - Ariana Godoy
        </p>
      </div>

      {/* Call to action button */}
      <button className="cta-button relative z-10 rounded-full bg-gradient-to-r from-[#5B5FCF] to-[#7B7FE8] px-12 py-4 text-lg font-semibold text-white transition-transform hover:scale-105">
        Join now
      </button>

      <style jsx>{`
        @keyframes float {
          0%,
          100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-20px);
          }
        }
      `}</style>
    </section>
  );
}
