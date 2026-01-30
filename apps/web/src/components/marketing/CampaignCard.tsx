import type { Campaign, CampaignStatus } from "@/lib/marketing/types";

const statusStyles: Record<CampaignStatus, { label: string; className: string }> = {
  draft: {
    label: "Draft",
    className: "border-amber-200 bg-amber-100/70 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/20 dark:text-amber-200",
  },
  scheduled: {
    label: "Scheduled",
    className: "border-blue-200 bg-blue-100/70 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/20 dark:text-blue-200",
  },
  active: {
    label: "Active",
    className: "border-emerald-200 bg-emerald-100/70 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/20 dark:text-emerald-200",
  },
  finished: {
    label: "Finished",
    className: "border-slate-200 bg-slate-100/80 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-white/60",
  },
};

export default function CampaignCard({
  campaign,
  isSelected,
  onSelect,
}: {
  campaign: Campaign;
  isSelected?: boolean;
  onSelect?: (campaign: Campaign) => void;
}) {
  const status = statusStyles[campaign.status];

  return (
    <button
      type="button"
      onClick={() => onSelect?.(campaign)}
      className={`w-full rounded-2xl border p-4 text-left transition-all focus:outline-none focus:ring-2 focus:ring-[#907AFF]/30 ${
        isSelected
          ? "border-[#907AFF]/40 bg-[#907AFF]/5"
          : "border-border bg-background hover:border-[#907AFF]/30 hover:bg-muted/40"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-[15px] font-semibold text-foreground">{campaign.name}</p>
          <p className="text-[12px] text-muted-foreground">{campaign.objective}</p>
        </div>
        <span
          className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${status.className}`}
        >
          {status.label}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        <span>{campaign.channels.length} channels</span>
        <span>Updated {campaign.updatedAt}</span>
        {campaign.budget ? <span>Budget {campaign.budget}</span> : null}
      </div>
    </button>
  );
}
