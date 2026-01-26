import GlassSurface from "@/components/GlassSurface";
import GridMotion from "@/components/GridMotion";
import TestimonialSection from "@/components/TestimonialSection";
import StatsSection from "@/components/StatsSection";
import FeaturesSection from "@/components/FeaturesSection";

const gridImages = [
  "https://images.unsplash.com/photo-1723403804231-f4e9b515fe9d?q=80&w=3870&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  "https://images.unsplash.com/photo-1748370987492-eb390a61dcda?q=80&w=3464&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
];

const gridRows = 6;
const gridCols = 10;
const gridItems = Array.from({ length: gridRows * gridCols }, (_, index) => {
  return gridImages[index % gridImages.length];
});

const glassBaseProps = {
  displace: 0.5,
  distortionScale: -180,
  redOffset: 0,
  greenOffset: 10,
  blueOffset: 20,
  brightness: 50,
  opacity: 0.93,
  backgroundOpacity: 0.12,
  blur: 12,
  saturation: 1.2,
  mixBlendMode: "screen",
};

export default function Home() {
  return (
    <main className="relative min-h-screen bg-[#050508] text-white">
      <header className="sticky top-6 z-20 mx-auto w-full max-w-[1660px] px-6">
        <GlassSurface
          {...glassBaseProps}
          width="100%"
          height="75px"
          borderRadius={300}
          className="w-full border border-white/10 px-6 py-4 md:px-10 [&_.glass-surface__content]:w-full [&_.glass-surface__content]:justify-between [&_.glass-surface__content]:p-0"
        >
          <nav className="flex w-full items-center justify-between gap-6">
            {/* Logo and navigation */}
            <div className="flex items-center gap-10">
              <img
                src="/favicon.svg"
                alt="Verkli"
                className="h-8 w-auto"
                loading="eager"
              />

              <div className="hidden items-center gap-10 text-[17px] font-normal text-white lg:flex">
                {["Features", "Integrations", "Examples", "FAQ"].map((item) => (
                  <button key={item} className="nav-item flex items-center gap-2">
                    <span>{item}</span>
                    <svg
                      className="h-3 w-3"
                      viewBox="0 0 12 12"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M3 4.5L6 7.5L9 4.5" />
                    </svg>
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-4">
              <button className="sign-in-button px-6 text-[17px] font-regular text-white/100">
                Sign in
              </button>
              <GlassSurface
                {...glassBaseProps}
                width="auto"
                height="auto"
                borderRadius={999}
                className="glass-surface--button border border-white/10"
              >
                <button className="sign-up-button px-7 py-0 text-[17px] font-medium text-[#F7F7F7]">
                  Sign up
                </button>
              </GlassSurface>
              <div className="divider hidden h-8 w-px bg-white/20 md:block" />
              <div className="hidden md:block">
                <GlassSurface
                  {...glassBaseProps}
                  width="auto"
                  height="auto"
                  borderRadius={999}
                  className="glass-surface--button"
                >
                  <button
                    className="language-toggle flex items-center justify-center px-3.5 py-2.5"
                    aria-label="Change language"
                  >
                    <svg
                      width="48"
                      height="18"
                      viewBox="0 0 48 18"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      aria-hidden="true"
                    >
                      <path d="M11.5083 11.1435L7.74534 0.305126C7.7102 0.203899 7.56721 0.203408 7.53137 0.304391L3.6371 11.2769" stroke="#F7F7F7" strokeWidth="1.70079" strokeLinecap="round"/>
                      <path d="M5.07678 7.75988H10.1083" stroke="#F7F7F7" strokeWidth="1.70079"/>
                      <path d="M16.3801 8.53955L26.4786 8.53955" stroke="#F7F7F7" strokeWidth="1.70079" strokeLinecap="round"/>
                      <path d="M21.4293 5.89978L21.4293 8.53782" stroke="#F7F7F7" strokeWidth="1.70079" strokeLinecap="round"/>
                      <path d="M16.3801 17.7874C23.4667 14.9174 24.2817 10.5237 24.8841 8.61028" stroke="#F7F7F7" strokeWidth="1.70079" strokeLinecap="round"/>
                      <path d="M18.1516 11.7992C19.0847 13.4645 20.8445 15.9803 24.8485 17.8228" stroke="#F7F7F7" strokeWidth="1.70079" strokeLinecap="round"/>
                      <path d="M42.1928 11.352C42.3576 11.5177 42.6286 11.5177 42.7934 11.352L47.0454 7.07497C47.2101 6.90924 47.2101 6.63658 47.0454 6.47084C46.8806 6.30511 46.6095 6.30511 46.4448 6.47084L42.4931 10.4458L38.5414 6.47084C38.3767 6.30511 38.1056 6.30511 37.9408 6.47084C37.7761 6.63658 37.7761 6.90924 37.9408 7.07497L42.1928 11.352Z" fill="#F7F7F7"/>
                    </svg>
                  </button>
                </GlassSurface>
              </div>
            </div>
          </nav>
        </GlassSurface>
      </header>

      <div className="section-stack">
      {/* Hero */}
      <section className="relative isolate mx-auto my-auto flex min-h-screen w-full max-w-[1800px] flex-col items-center justify-center overflow-hidden px-6 pb-50 text-center">
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="relative h-full w-full">
            <div className="absolute inset-0 z-0">
              <GridMotion
                items={gridItems}
                gradientColor="black"
                rows={gridRows}
                cols={gridCols}
              />
            </div>
            <div className="absolute inset-0 z-10 bg-black/75" />
            {/* Gradient fade to black at top */}
            <div className="absolute inset-x-0 top-0 z-15 h-[150px] bg-gradient-to-b from-[#050508] via-[#050508]/30 to-transparent" />
            {/* Gradient fade to black at bottom */}
            <div className="absolute inset-x-0 bottom-0 z-15 h-[200px] bg-gradient-to-t from-[#050508] via-[#050508]/30 to-transparent" />
          </div>
        </div>

        <h1 className="max-w-auto text-4xl font-semibold leading-tight md:text-6xl">
        Write once. <br></br>Show up everywhere.
        </h1>
        <p className="mt-6 max-w-xl text-base text-white/70 md:text-lg">
        verkli is designed for authors to market their books, connect with readers and grow sustainable revenue.
        </p>

        <GlassSurface
          {...glassBaseProps}
          width="auto"
          height="auto"
          borderRadius={999}
          className="glass-surface--button mt-20 border border-white/20 transition hover:scale-105"
        >
          <button className="px-6 py-2 text-md font-semibold text-white">
            Get started as a writer
          </button>
        </GlassSurface>
      </section>

      <section className="mx-auto flex w-full max-w-[1660px] items-center justify-between gap-12 px-6 lg:px-[115px]">
        {/* Left content */}
        <div className="flex max-w-[778px] flex-col gap-2.5">
          <p className="text-[17px] font-medium uppercase leading-[24.945px] text-white/50">
            Built for authors. By authors.
          </p>
          <h2 className="text-5xl font-normal leading-[120%] text-[#F7F7F7]">
            Zero friction book marketing
          </h2>
          <p className="mt-2 max-w-[661px] text-[22px] font-normal leading-[140%] text-[#F7F7F7]">
            An end to end platform built for authors. Fable turns your book into structured content that is easy to publish, easy to adapt and easy to scale without extra accounts or manual work.
          </p>
        </div>

        {/* Right logo carousel */}
        <div className="relative h-[100px] w-full max-w-[734px] overflow-hidden">
          <div className="logo-carousel-track absolute left-0 top-1/2 flex -translate-y-1/2 items-center gap-12">
            {/* First set of logos */}
            <div className="logo-item h-[60px] w-[140px] flex-shrink-0 rounded-lg bg-white/10 backdrop-blur-sm"></div>
            <div className="logo-item h-[60px] w-[140px] flex-shrink-0 rounded-lg bg-white/10 backdrop-blur-sm"></div>
            <div className="logo-item h-[60px] w-[140px] flex-shrink-0 rounded-lg bg-white/10 backdrop-blur-sm"></div>
            <div className="logo-item h-[60px] w-[140px] flex-shrink-0 rounded-lg bg-white/10 backdrop-blur-sm"></div>
            <div className="logo-item h-[60px] w-[140px] flex-shrink-0 rounded-lg bg-white/10 backdrop-blur-sm"></div>
            {/* Duplicate set for seamless loop */}
            <div className="logo-item h-[60px] w-[140px] flex-shrink-0 rounded-lg bg-white/10 backdrop-blur-sm"></div>
            <div className="logo-item h-[60px] w-[140px] flex-shrink-0 rounded-lg bg-white/10 backdrop-blur-sm"></div>
            <div className="logo-item h-[60px] w-[140px] flex-shrink-0 rounded-lg bg-white/10 backdrop-blur-sm"></div>
            <div className="logo-item h-[60px] w-[140px] flex-shrink-0 rounded-lg bg-white/10 backdrop-blur-sm"></div>
            <div className="logo-item h-[60px] w-[140px] flex-shrink-0 rounded-lg bg-white/10 backdrop-blur-sm"></div>
          </div>
          {/* Gradient overlays */}
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-[156px] bg-gradient-to-r from-[#050508] to-transparent"></div>
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-[156px] bg-gradient-to-l from-[#050508] to-transparent"></div>
        </div>
      </section>

      <TestimonialSection />

      <StatsSection />

      <FeaturesSection />

      <section className="relative mx-auto w-full max-w-[1660px] px-6">
        <div className="momentum-surface relative overflow-hidden rounded-[56px] px-6 py-16 md:px-16 md:py-24">
          <div className="momentum-bg">
            <div className="momentum-orb orb-1" />
            <div className="momentum-orb orb-2" />
            <div className="momentum-orb orb-3" />
            <div className="momentum-orb orb-4" />
          </div>

          <div className="relative z-10 grid gap-12 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="flex flex-col justify-center">
              <h2 className="max-w-[560px] text-4xl font-semibold leading-tight text-white md:text-5xl">
                Turn your book
                <br />
                into momentum.
              </h2>
              <p className="mt-4 max-w-[520px] text-base text-white/80 md:text-lg">
                Fable extracts quotes, ideas, hooks and themes directly from
                your book and repurposes them across formats.
              </p>
              <div className="mt-8">
                <GlassSurface
                  {...glassBaseProps}
                  width="auto"
                  height="auto"
                  borderRadius={999}
                  className="glass-surface--button border border-white/30"
                >
                  <button className="px-7 py-3 text-sm font-semibold text-white">
                    Join now
                  </button>
                </GlassSurface>
              </div>
            </div>

            <div className="relative min-h-[560px]">
              <div className="absolute left-6 top-10 h-[230px] w-[160px] -rotate-[8deg] rounded-[20px] bg-gradient-to-b from-yellow-200 to-orange-500 shadow-[0_35px_80px_-40px_rgba(0,0,0,0.7)]" />
              <div className="absolute right-6 top-0 h-[260px] w-[185px] rotate-[8deg] rounded-[20px] bg-gradient-to-b from-red-500 to-black shadow-[0_40px_90px_-45px_rgba(0,0,0,0.8)]" />
              <div className="absolute bottom-0 right-24 h-[230px] w-[160px] rotate-[4deg] rounded-[20px] bg-gradient-to-b from-pink-200 to-purple-400 shadow-[0_35px_80px_-40px_rgba(0,0,0,0.7)]" />

              <GlassSurface
                {...glassBaseProps}
                width="260px"
                height="auto"
                borderRadius={18}
                className="absolute right-28 top-20 border border-white/20 px-4 py-3 text-sm text-white/90"
              >
                <div className="text-left">
                  “Watching Through My Window successed has been incredible and
                  such a blessing.”
                  <div className="mt-2 text-right text-xs text-white/70">
                    — Ariana Godoy
                  </div>
                </div>
              </GlassSurface>

              <GlassSurface
                {...glassBaseProps}
                width="260px"
                height="auto"
                borderRadius={18}
                className="absolute bottom-10 right-0 border border-white/20 px-4 py-3 text-sm text-white/90"
              >
                <div className="text-left">
                  “Watching Through My Window successed has been incredible and
                  such a blessing.”
                  <div className="mt-2 text-right text-xs text-white/70">
                    — Ariana Godoy
                  </div>
                </div>
              </GlassSurface>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-[1200px] px-6 pb-24">
        <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
          <h2 className="text-3xl font-semibold leading-tight text-white md:text-4xl">
            Smart tools to help
            <br />
            your book grow.
          </h2>
          <p className="max-w-[420px] text-lg font-medium leading-[140%] text-white/90">
            Turn stories into content.
            <br />
            Reach readers where they scroll.
          </p>
        </div>

        <div className="mt-12 grid gap-6 border-b border-white/10 pb-6 text-xs font-semibold uppercase tracking-[0.14em] text-white/60 lg:grid-cols-[1fr_1fr]">
          <div>Your goal</div>
          <div>How we help</div>
        </div>

        {[
          {
            title: "Get discovered",
            body: [
              "Turn your book into scroll-stopping content.",
              "Create TikToks and short clips directly from your chapters. Show up where readers actually spend their time.",
              "No ads. No gatekeepers. Just reach.",
            ],
          },
          {
            title: "Grow your audience",
            body: [
              "Reach readers before they even buy the book.",
              "Publish content made for BookTok and short-form platforms. Turn one chapter into multiple posts.",
              "Build momentum before launch — and long after.",
            ],
          },
          {
            title: "Automate your marketing",
            body: [
              "Let your book market itself.",
              "AI-generated hooks, scripts, and captions — ready to post. Consistent content without daily effort.",
              "More visibility. Less burnout.",
            ],
          },
          {
            title: "Focus on writing",
            body: [
              "Spend time on your story, not promotion.",
              "No complex tools. No marketing background needed. Upload a chapter. Get content. Repeat.",
              "Publishing, simplified.",
            ],
          },
        ].map((item, index) => (
          <div
            key={item.title}
            className="grid gap-8 border-b border-white/10 py-8 lg:grid-cols-[1fr_1fr]"
          >
            <div className="flex items-start gap-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 text-base font-semibold text-white/90">
                {index + 1}
              </div>
              <h3 className="text-xl font-semibold text-white">{item.title}</h3>
            </div>
            <div className="space-y-4 text-sm leading-[170%] text-white/75">
              <p className="text-white/90">{item.body[0]}</p>
              <p>{item.body[1]}</p>
              <p className="text-white/85">{item.body[2]}</p>
            </div>
          </div>
        ))}
      </section>

      <section className="mx-auto w-full max-w-[1400px] px-6 pb-24">
        <div className="relative min-h-[800px] overflow-hidden text-center">
          <div className="footer-cta">
            <h2 className="text-3xl font-semibold text-white md:text-4xl">
              Ready to turn your book into content?
            </h2>
            <p className="mt-3 text-base text-white/70">
              Upload a chapter and watch it become
              <br />
              scroll-stopping stories.
            </p>
            <div className="footer-cta-form">
              <input
                className="flex-1 bg-transparent px-5 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none"
                placeholder="Your email"
                type="email"
              />
              <button className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-black">
                Get started now
              </button>
            </div>
          </div>

          <div className="footer-cover-grid">
            <div>
              {/* First set of covers */}
              {Array.from({ length: 15 }).map((_, index) => (
                <div key={`set1-${index}`} className={`footer-cover cover-${(index % 6) + 1}`} />
              ))}
              {/* Duplicate set for seamless loop */}
              {Array.from({ length: 15 }).map((_, index) => (
                <div key={`set2-${index}`} className={`footer-cover cover-${(index % 6) + 1}`} />
              ))}
              {/* Third set for extra smooth loop */}
              {Array.from({ length: 15 }).map((_, index) => (
                <div key={`set3-${index}`} className={`footer-cover cover-${(index % 6) + 1}`} />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-16 grid gap-12 border-t border-white/10 pt-12 md:grid-cols-[1.1fr_1fr_1fr_1fr]">
          <div className="space-y-4">
          <img
                src="/favicon.svg"
                alt="Verkli"
                className="h-8 w-auto"
                loading="eager"
              />
              <h3 className="text-2xl font-semibold text-white">
              Where books
              <br />
              become
              <br />
              momentum.
            </h3>
          </div>

          <div className="grid gap-8 text-sm text-white/70 md:grid-cols-2 md:gap-10">
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/60">
                Website tools
              </p>
              <ul className="space-y-2">
                <li>Start your business</li>
                <li>Create your website</li>
                <li>Build your inventory</li>
                <li>Own your site domain</li>
              </ul>
              <p className="pt-3 text-xs font-semibold uppercase tracking-[0.14em] text-white/60">
                Marketing tools
              </p>
              <ul className="space-y-2">
                <li>Market your restaurant</li>
                <li>Retain customers</li>
                <li>Nurture your customers</li>
                <li>Built in SEO</li>
              </ul>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/60">
                Sales tools
              </p>
              <ul className="space-y-2">
                <li>Sell online</li>
                <li>Sell in person</li>
                <li>Check out customers</li>
                <li>Delivery</li>
                <li>Gift cards</li>
              </ul>
              <p className="pt-3 text-xs font-semibold uppercase tracking-[0.14em] text-white/60">
                Backoffice
              </p>
              <ul className="space-y-2">
                <li>Manage your restaurant</li>
                <li>Measure your performance</li>
                <li>Job listings</li>
                <li>Review generator</li>
              </ul>
            </div>
          </div>

          <div className="space-y-3 text-sm text-white/70">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/60">
              About
            </p>
            <ul className="space-y-2">
              <li>About Rushable</li>
              <li>Referral program</li>
              <li>Careers</li>
            </ul>
            <p className="pt-3 text-xs font-semibold uppercase tracking-[0.14em] text-white/60">
              Resources
            </p>
            <ul className="space-y-2">
              <li>Merchant support</li>
              <li>Help Center</li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-4 border-t border-white/10 pt-6 text-sm text-white/60 md:flex-row">
          <div className="flex items-center gap-6">
            <span>Language</span>
            <span>A-Z</span>
            <span>Terms of Service</span>
            <span>Privacy Policy</span>
          </div>
          <span>© 2026 Fable</span>
        </div>
      </section>
      </div>
    </main>
  )
}
