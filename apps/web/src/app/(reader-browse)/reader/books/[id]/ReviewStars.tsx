"use client";

import { Star } from "lucide-react";

type ReviewStarsProps = {
  value: number;
  onChange?: (value: number) => void;
  readOnly?: boolean;
  size?: "sm" | "md";
  className?: string;
};

export default function ReviewStars({
  value,
  onChange,
  readOnly = false,
  size = "md",
  className,
}: ReviewStarsProps) {
  const iconSizeClass = size === "sm" ? "h-4 w-4" : "h-5 w-5";

  return (
    <div className={`flex items-center gap-1 ${className ?? ""}`}>
      {Array.from({ length: 5 }, (_, index) => {
        const starValue = index + 1;
        const active = starValue <= value;
        const icon = (
          <Star
            className={`${iconSizeClass} transition ${
              active
                ? "fill-amber-400 text-amber-400"
                : "fill-transparent text-slate-300 dark:text-white/25"
            }`}
            aria-hidden="true"
          />
        );

        if (readOnly) {
          return <span key={starValue}>{icon}</span>;
        }

        return (
          <button
            key={starValue}
            type="button"
            onClick={() => onChange?.(starValue)}
            // 20x20 icon with no padding before this — the smallest target on
            // the page, on the one thing the page asks a reader to do. The
            // readOnly branch above is untouched so display ratings stay tight.
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded p-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#907AFF]/50"
            aria-label={`Set rating to ${starValue}`}
            aria-pressed={active}
          >
            {icon}
          </button>
        );
      })}
    </div>
  );
}
