"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type LazySectionProps = {
  children: ReactNode;
  className?: string;
  rootMargin?: string;
  minHeight?: number | string;
  fallback?: ReactNode;
};

export default function LazySection({
  children,
  className,
  rootMargin = "320px 0px",
  minHeight,
  fallback = null,
}: LazySectionProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || isVisible) return;

    if (typeof IntersectionObserver === "undefined") {
      const timer = window.setTimeout(() => setIsVisible(true), 0);
      return () => window.clearTimeout(timer);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry?.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [isVisible, rootMargin]);

  return (
    <div ref={ref} className={cn(className)} style={!isVisible && minHeight ? { minHeight } : undefined}>
      {isVisible ? children : fallback}
    </div>
  );
}
