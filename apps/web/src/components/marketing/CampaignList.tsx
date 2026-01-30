import CampaignCard from "@/components/marketing/CampaignCard";
import type { Campaign, ModuleState } from "@/lib/marketing/types";

const renderSkeleton = () => (
  <div className="space-y-3">
    {Array.from({ length: 3 }).map((_, index) => (
      <div key={index} className="h-[88px] w-full rounded-2xl border border-border bg-muted/40" />
    ))}
  </div>
);

export default function CampaignList({
  campaigns,
  state,
  selectedCampaign,
  onSelect,
}: {
  campaigns: Campaign[];
  state: ModuleState;
  selectedCampaign: Campaign | null;
  onSelect: (campaign: Campaign) => void;
}) {
  if (state === "loading") return renderSkeleton();

  if (state === "error") {
    return (
      <div className="rounded-2xl border border-dashed border-destructive/40 bg-destructive/10 p-6 text-sm text-destructive">
        Campaigns failed to load. Try again when the service is ready.
      </div>
    );
  }

  if (state === "empty") {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/40 p-6 text-sm text-muted-foreground">
        No campaigns yet. Create your first campaign to start organizing your launch.
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
      <div className="space-y-3">
        {campaigns.map((campaign) => (
          <CampaignCard
            key={campaign.id}
            campaign={campaign}
            isSelected={selectedCampaign?.id === campaign.id}
            onSelect={onSelect}
          />
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-muted/30 p-5">
        {selectedCampaign ? (
          <div className="space-y-4">
            <div>
              <p className="text-[12px] uppercase tracking-[0.2em] text-muted-foreground">Campaign details</p>
              <h3 className="mt-2 text-[18px] font-semibold text-foreground">
                {selectedCampaign.name}
              </h3>
              <p className="mt-1 text-[13px] text-muted-foreground">{selectedCampaign.objective}</p>
            </div>
            <div className="grid gap-3 text-[13px] text-muted-foreground">
              <div className="flex items-center justify-between">
                <span>Timeline</span>
                <span>
                  {selectedCampaign.startDate ?? "TBD"} - {selectedCampaign.endDate ?? "TBD"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Last updated</span>
                <span>{selectedCampaign.updatedAt}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Channels</span>
                <span>{selectedCampaign.channels.join(", ")}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Budget</span>
                <span>{selectedCampaign.budget ?? "Not set"}</span>
              </div>
            </div>
            <button className="w-full rounded-xl border border-border bg-background px-4 py-2 text-[13px] font-semibold text-foreground transition hover:border-[#907AFF]/40 hover:text-[#907AFF]">
              Open campaign detail
            </button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Select a campaign to see details.</p>
        )}
      </div>
    </div>
  );
}
