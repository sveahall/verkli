"use client";

import type { ReactNode } from "react";
import GradientText from "@/components/GradientText";

type BrandGradientTextProps = {
  children: ReactNode;
  className?: string;
  colors?: string[];
  animationSpeed?: number;
};

const DEFAULT_COLORS = ["#907aff", "#e29ed5", "#fcc997"];

export default function BrandGradientText({
  children,
  className,
  colors = DEFAULT_COLORS,
  animationSpeed = 8.5,
}: BrandGradientTextProps) {
  return (
    <GradientText
      colors={colors}
      animationSpeed={animationSpeed}
      showBorder={false}
      className={className}
    >
      {children}
    </GradientText>
  );
}
