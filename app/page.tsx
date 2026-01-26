"use client";

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

export default function RoleSelection() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#0d0b14]">
      {/* Background gradient orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/3 top-1/4 h-[700px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-purple-700/40 blur-[180px]" />
        <div className="absolute bottom-0 left-1/2 h-[600px] w-[900px] -translate-x-1/2 translate-y-1/3 rounded-full bg-purple-600/35 blur-[150px]" />
        <div className="absolute right-0 top-1/2 h-[500px] w-[500px] -translate-y-1/2 translate-x-1/4 rounded-full bg-indigo-500/25 blur-[120px]" />
      </div>

      {/* Logo */}
      <header className="absolute left-8 top-8 z-20">
        <div className="flex items-center gap-3">
          <img
            src="/favicon.svg"
            alt="Verkli"
            className="h-8 w-auto"
            loading="eager"
          />
        </div>
      </header>

      {/* Role selection card */}
      <GlassSurface
        {...glassBaseProps}
        width="520px"
        height="auto"
        borderRadius={40}
        className="relative z-10 border border-white/10"
      >
        <div className="flex w-full flex-col items-center px-14 py-16 text-center">
          <p className="text-base font-medium tracking-wide text-white/50">
            Welcome to verkli
          </p>
          
          <h1 className="mt-5 text-[44px] font-semibold leading-[1.15] tracking-tight text-white">
            Are you a writer
            <br />
            or reader?
          </h1>
          
          <p className="mt-5 max-w-[340px] text-base leading-relaxed text-white/45">
            Verkli adapts to how you use it.
            <br />
            You can switch anytime.
          </p>

          <div className="mt-12 flex w-full flex-col items-center gap-4">
            <Link href="/writer" className="w-full">
              <GlassSurface
                {...glassBaseProps}
                width="100%"
                height="auto"
                borderRadius={999}
                className="glass-surface--button w-full border border-white/10 transition-transform hover:scale-[1.02]"
              >
                <button className="w-full px-8 py-4 text-[15px] font-medium text-white/90">
                  I am a writer
                </button>
              </GlassSurface>
            </Link>
            
            <span className="text-sm font-medium text-white/30">or</span>
            
            <Link href="/reader" className="w-full">
              <GlassSurface
                {...glassBaseProps}
                width="100%"
                height="auto"
                borderRadius={999}
                backgroundOpacity={0.25}
                className="glass-surface--button w-full border border-white/10 transition-transform hover:scale-[1.02]"
              >
                <button className="w-full px-8 py-4 text-[15px] font-medium text-white/90">
                  I am a reader
                </button>
              </GlassSurface>
            </Link>
          </div>
        </div>
      </GlassSurface>
    </main>
  );
}
