import { Sparkles } from "lucide-react";

type ProBadgeSize = "sm" | "md";

interface ProBadgeProps {
  /** Tier to render. "pro_plus" renders a "PRO+" label. */
  tier?: "pro" | "pro_plus";
  size?: ProBadgeSize;
  /** Periodic gloss sweep (`.badge-shimmer`). On by default; disable in dense lists. */
  shimmer?: boolean;
  className?: string;
}

const SIZE: Record<ProBadgeSize, { box: string; icon: string }> = {
  sm: { box: "px-2 py-0.5 gap-1 text-[11px]", icon: "h-3 w-3" },
  md: { box: "px-2.5 py-1 gap-1.5 text-[12px]", icon: "h-3.5 w-3.5" },
};

/**
 * Verkli PRO author badge. Solid brand-violet pill with icon + label — status
 * is never encoded by color alone (DESIGN.md). Presentational only; resolve
 * PRO status with `getAuthorProStatusSet` / `isAuthorPro` and render this when true.
 */
export default function ProBadge({
  tier = "pro",
  size = "sm",
  shimmer = true,
  className = "",
}: ProBadgeProps) {
  const s = SIZE[size];
  const label = tier === "pro_plus" ? "PRO+" : "PRO";
  const aria = tier === "pro_plus" ? "Verkli PRO+ author" : "Verkli PRO author";
  return (
    <span
      role="img"
      aria-label={aria}
      title={aria}
      className={[
        "relative inline-flex items-center overflow-hidden rounded-full",
        "bg-[#907AFF] font-semibold uppercase tracking-wide text-white",
        "shadow-surface-sm",
        s.box,
        shimmer ? "badge-shimmer" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Sparkles className={s.icon} aria-hidden />
      {label}
    </span>
  );
}
