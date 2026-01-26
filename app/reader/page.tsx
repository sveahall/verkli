import Link from "next/link";
import GlassSurface from "@/components/GlassSurface";

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

export default function ReaderLanding() {
  return (
    <main className="relative min-h-screen bg-[#050508] text-white">
      {/* Header */}
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
              <Link href="/">
                <img
                  src="/favicon.svg"
                  alt="Verkli"
                  className="h-8 w-auto"
                  loading="eager"
                />
              </Link>

              <div className="hidden items-center gap-10 text-[17px] font-normal text-white lg:flex">
                {["Discover", "Categories", "Authors", "About"].map((item) => (
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
              <Link href="/reader/signin" className="sign-in-button px-6 text-[17px] font-regular text-white/100 transition hover:text-white/70">
                Sign in
              </Link>
              <Link href="/reader/signup">
                <GlassSurface
                  {...glassBaseProps}
                  width="auto"
                  height="auto"
                  borderRadius={999}
                  className="glass-surface--button border border-white/10 transition-transform hover:scale-[1.02]"
                >
                  <span className="sign-up-button px-7 py-0 text-[17px] font-medium text-[#F7F7F7]">
                    Sign up
                  </span>
                </GlassSurface>
              </Link>
            </div>
          </nav>
        </GlassSurface>
      </header>

      {/* Hero Section */}
      <section className="relative mx-auto flex min-h-[80vh] w-full max-w-[1400px] flex-col items-center justify-center px-6 text-center">
        {/* Background gradient orbs */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute left-1/4 top-1/4 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-600/30 blur-[150px]" />
          <div className="absolute bottom-0 right-1/4 h-[400px] w-[600px] translate-x-1/2 translate-y-1/4 rounded-full bg-purple-500/25 blur-[120px]" />
        </div>

        <h1 className="relative z-10 max-w-[800px] text-5xl font-semibold leading-tight md:text-6xl">
          Discover stories that
          <br />
          move you.
        </h1>
        <p className="relative z-10 mt-6 max-w-xl text-base text-white/70 md:text-lg">
          Connect with your favorite authors, explore new worlds, and be part of the stories you love.
        </p>

        <div className="relative z-10 mt-10 flex gap-4">
          <Link href="/reader/signup">
            <GlassSurface
              {...glassBaseProps}
              width="auto"
              height="auto"
              borderRadius={999}
              backgroundOpacity={0.25}
              className="border border-white/20 transition-transform hover:scale-[1.02]"
            >
              <span className="px-8 py-3 text-[15px] font-semibold text-white">
                Start reading
              </span>
            </GlassSurface>
          </Link>
          <Link
            href="#explore"
            className="flex items-center gap-2 rounded-full border border-white/10 px-8 py-3 text-[15px] font-medium text-white/80 transition hover:bg-white/5"
          >
            Explore books
          </Link>
        </div>
      </section>

      {/* Featured Section Placeholder */}
      <section id="explore" className="mx-auto w-full max-w-[1400px] px-6 py-24">
        <h2 className="text-3xl font-semibold text-white">Featured Books</h2>
        <p className="mt-2 text-white/60">Coming soon...</p>
        
        <div className="mt-12 grid gap-6 md:grid-cols-3 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="aspect-[3/4] rounded-2xl border border-white/10 bg-white/5"
            />
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="mx-auto w-full max-w-[1400px] border-t border-white/10 px-6 py-12">
        <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
          <div className="flex items-center gap-3">
            <img src="/favicon.svg" alt="Verkli" className="h-6 w-6" />
            <span className="font-medium text-white">verkli</span>
          </div>
          <div className="flex gap-6 text-sm text-white/50">
            <Link href="/" className="transition hover:text-white/70">Home</Link>
            <Link href="/reader/signin" className="transition hover:text-white/70">Sign in</Link>
            <Link href="/writer" className="transition hover:text-white/70">For writers</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
