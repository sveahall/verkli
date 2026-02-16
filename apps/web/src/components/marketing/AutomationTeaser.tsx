export default function AutomationTeaser() {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-border bg-background p-6">
      <div className="absolute inset-0 bg-gradient-to-br from-[#907AFF]/15 via-transparent to-[#FCC997]/20 opacity-70" />
      <div className="relative z-10 space-y-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#907AFF]/15 text-[#907AFF]">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
            </svg>
          </span>
          <div>
            <p className="text-[15px] font-semibold text-foreground">Automation tools</p>
            <p className="text-[12px] text-muted-foreground">
              Smart schedules, auto-repurpose, and hands-free publishing.
            </p>
          </div>
        </div>
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          Chain prompts, schedule campaigns, and trigger content across channels from one workflow.
          {/* TODO: Connect automation rules and AI pipelines here. */}
        </div>
        <button className="rounded-xl bg-gradient-to-r from-[#907AFF] to-[#8069EE] px-5 py-2.5 text-[13px] font-semibold text-white transition hover:from-[#8069EE] hover:to-[#7058DD]">
          Upgrade to PRO
        </button>
      </div>
    </div>
  );
}
