"use client";

import Link from "next/link";
import GlassSurface from "@/components/GlassSurface";
import LiquidEther from "@/components/LiquidEther";

const glassBaseProps = {
  displace: 0.5,
  distortionScale: -180,
  redOffset: 0,
  greenOffset: 10,
  blueOffset: 20,
  brightness: 50,
  opacity: 0.93,
  backgroundOpacity: 0,
  blur: 8,
  saturation: 1,
  mixBlendMode: "difference",
};

const glassCardProps = {
  ...glassBaseProps,
};

const glassButtonProps = {
  ...glassBaseProps,
};

export default function RoleSelection() {
  return (
    <main 
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden"
      style={{ background: "radial-gradient(100% 127.91% at 0% 0%, #3A3A4F 0%, #171620 50%, #000000 100%)" }}
    >
      {/* Animated background */}
      <div className="absolute inset-0 z-0">
        <LiquidEther
          colors={["#907AFF", "#E29ED5", "#FCC997", "#FEE9A3"]}
          color0="#907AFF"
          color1="#E29ED5"
          color2="#FCC997"
          mouseForce={12}
          cursorSize={85}
          isViscous={false}
          viscous={8}
          iterationsViscous={4}
          iterationsPoisson={12}
          resolution={0.2}
          isBounce
          autoDemo={false}
          autoSpeed={0.5}
          autoIntensity={2}
          takeoverDuration={0.5}
          autoResumeDelay={3000}
          autoRampDuration={0.25}
          className="liquid-ether-layer"
        />
      </div>

      {/* Logo */}
      <header className="absolute left-8 top-8 z-20">
        <div className="flex items-center gap-3">
          <img
            src="/logo-dark.svg"
            alt="Verkli"
            className="h-8 w-auto dark:hidden"
            loading="eager"
          />
          <img
            src="/favicon.svg"
            alt="Verkli"
            className="hidden h-8 w-auto dark:block"
            loading="eager"
          />
        </div>
      </header>

      {/* Role selection card */}
      <GlassSurface
        {...glassCardProps}
        width="520px"
        height="auto"
        borderRadius={40}
        className="glass-card relative z-10"
      >
        <div className="flex w-full flex-col items-center px-14 py-16 text-center">
          <p className="text-base font-medium tracking-wide text-white/75">
            Welcome to verkli
          </p>
          
          <h1 className="mt-5 text-[44px] font-medium leading-[1.15] tracking-tight text-white">
            Are you a writer
            <br />
            or reader?
          </h1>
          
          <p className="mt-5 max-w-[340px] text-base leading-relaxed text-white/75">
            Verkli adapts to how you use it.
            <br />
            You can switch anytime.
          </p>

          <div className="mt-12 flex w-full flex-col items-center gap-4">
            <Link href="/writer" className="w-full">
              <GlassSurface
                {...glassButtonProps}
                width="100%"
                height="auto"
                borderRadius={999}
                className="glass-button w-full"
              >
                <button className="w-full px-7 py-1.5 text-[17px] font-medium text-white">
                  I am a writer
                </button>
              </GlassSurface>
            </Link>
            
            <span className="text-sm font-medium text-white/35">or</span>
            
            <Link href="/reader" className="w-full">
              <GlassSurface
                {...glassButtonProps}
                width="100%"
                height="auto"
                borderRadius={999}
                backgroundOpacity={0.22}
                className="glass-button w-full"
              >
                <button className="w-full px-7 py-1.5 text-[17px] font-medium text-white">
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
