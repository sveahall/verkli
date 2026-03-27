import type { ReactNode } from "react";
import GlassSurface from "@/components/GlassSurface";

/** Gemensam glass-kort för signin, signup, selector. En källa – Safari fallback i GlassSurface.css (backdrop-filter + -webkit-backdrop-filter + rgba fallback). */
export const glassCardProps = {
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
  mixBlendMode: "screen" as const,
};

const glassCardClassName =
  "glass-card relative z-20 mx-4 w-full max-w-[480px] border border-black/[0.1] dark:border-white/[0.1] sm:mx-6 sm:rounded-[32px] md:rounded-[40px]";

export default function GlassCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <GlassSurface
      {...glassCardProps}
      width="100%"
      height="auto"
      borderRadius={24}
      className={className ? `${glassCardClassName} ${className}` : glassCardClassName}
    >
      {children}
    </GlassSurface>
  );
}
