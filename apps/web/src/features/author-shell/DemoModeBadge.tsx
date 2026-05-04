/**
 * Discreet "Demo mode" status pill rendered top-right of the (app-author)
 * layout when isDemoModeActive(profile) is true. Distinct from the dev
 * toggle pill in the bottom-left — this one is the demo's *own* status
 * indicator, on screen for the entire pitch so the audience never has to
 * wonder whether they're seeing real or façade data.
 *
 * Server component — visibility is decided in the layout via the
 * already-loaded profile, so no client gating is needed.
 */
export default function DemoModeBadge() {
  return (
    <div
      className="pointer-events-none fixed right-4 top-4 z-[1000] flex items-center gap-2"
      aria-label="Demo mode active"
    >
      <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--brand-violet)]/30 bg-white/85 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--brand-violet)] shadow-sm backdrop-blur">
        <span
          className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--brand-violet)]"
          style={{ animation: "demoPulse 1.6s ease-in-out infinite" }}
          aria-hidden
        />
        Demo mode
      </span>
      <style>{`
        @keyframes demoPulse {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.15); }
        }
      `}</style>
    </div>
  );
}
