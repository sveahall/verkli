"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import CampaignList from "@/components/marketing/CampaignList";
import ContentGenerator from "@/components/marketing/ContentGenerator";
import DistributionChannels from "@/components/marketing/DistributionChannels";
import PerformanceOverview from "@/components/marketing/PerformanceOverview";
import AutomationTeaser from "@/components/marketing/AutomationTeaser";
import MarketingCaptionPortal from "@/components/marketing/MarketingCaptionPortal";
import CampaignCreationFlow from "@/components/marketing/CampaignCreationFlow";
import type { Campaign, Channel, GeneratorOutput, ModuleState } from "@/lib/marketing/types";

const GENERATOR_DEFAULTS: GeneratorOutput[] = [
  {
    id: "hook",
    label: "Hook generator",
    placeholder: "Describe the moment you want to highlight...",
    sampleOutput: "",
  },
  {
    id: "blurb",
    label: "Blurb generator",
    placeholder: "Summarize the chapter, theme, or cliffhanger...",
    sampleOutput: "",
  },
  {
    id: "social",
    label: "Social captions",
    placeholder: "Share the mood, character, or release update...",
    sampleOutput: "",
  },
];

const navItems = [
  { id: "caption-portal", label: "Caption-portal", helper: "Generera & spara" },
  { id: "campaigns", label: "Campaigns", helper: "Plan launches" },
  { id: "content", label: "Content", helper: "Hooks + blurbs" },
  { id: "distribution", label: "Distribution", helper: "Channels" },
  { id: "performance", label: "Performance", helper: "Analytics" },
  { id: "automation", label: "Automation", helper: "Not available" },
];

type BookOption = { id: string; title: string };

type MarketingDashboardProps = {
  initialCampaigns?: Campaign[];
  initialBooks?: BookOption[];
};

type DashboardSectionProps = {
  id: string;
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
};

function DashboardSection({ id, title, description, action, children }: DashboardSectionProps) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="rounded-3xl border border-border bg-background p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-[20px] font-semibold text-foreground">{title}</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">{description}</p>
          </div>
          {action ? <div className="flex items-center gap-2">{action}</div> : null}
        </div>
        <div className="mt-6">{children}</div>
      </div>
    </section>
  );
}

export default function MarketingDashboard({
  initialCampaigns = [],
  initialBooks = [],
}: MarketingDashboardProps) {
  const [campaigns, setCampaigns] = useState<Campaign[]>(initialCampaigns);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(
    initialCampaigns[0]?.id ?? null
  );
  const [showCreateCampaign, setShowCreateCampaign] = useState(false);

  // Fetch campaigns from DB on mount if none provided
  const fetchCampaigns = useCallback(async () => {
    if (initialCampaigns.length > 0) return;
    try {
      const bookId = initialBooks[0]?.id;
      if (!bookId) return;
      const res = await fetch(`/api/marketing/assets?bookId=${bookId}`);
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.assets) && data.assets.length > 0) {
        const mapped: Campaign[] = data.assets.map((a: Record<string, unknown>) => ({
          id: String(a.id),
          name: String(a.content_type ?? "caption"),
          objective: String(a.text ?? "").slice(0, 80),
          status: "draft" as const,
          updatedAt: String(a.created_at ?? new Date().toISOString()),
          channels: [String(a.channel ?? "instagram")],
        }));
        setCampaigns(mapped);
        if (!selectedCampaignId && mapped.length > 0) {
          setSelectedCampaignId(mapped[0].id);
        }
      }
    } catch {
      // silent — show empty state
    }
  }, [initialBooks, initialCampaigns.length, selectedCampaignId]);

  useEffect(() => {
    fetchCampaigns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedCampaign = useMemo(() => {
    return campaigns.find((campaign) => campaign.id === selectedCampaignId) ?? null;
  }, [campaigns, selectedCampaignId]);

  const campaignState: ModuleState = campaigns.length ? "populated" : "empty";
  const generatorState: ModuleState = "populated";
  const distributionState: ModuleState = channels.length ? "populated" : "empty";
  const performanceState: ModuleState = "empty";
  const metrics: { id: string; label: string; value: string; change?: string; trend?: "up" | "down" | "flat" }[] = [];

  const handleSelectCampaign = (campaign: Campaign) => {
    setSelectedCampaignId(campaign.id);
  };

  const handleToggleChannel = (id: string) => {
    setChannels((prev) =>
      prev.map((channel) =>
        channel.id === id ? { ...channel, enabled: !channel.enabled } : channel
      )
    );
  };

  const handleCampaignCreated = (campaign: Campaign) => {
    setCampaigns((prev) => [campaign, ...prev]);
    setSelectedCampaignId(campaign.id);
    setShowCreateCampaign(false);
  };

  return (
    <div className="relative mx-auto w-full max-w-[1200px] px-6 py-10 lg:px-10">
      <div>
        <p className="text-[12px] uppercase tracking-[0.3em] text-muted-foreground">
          Marketing tools
        </p>
        <h1 className="mt-2 text-[32px] font-semibold text-foreground">Marketing dashboard</h1>
        <p className="mt-3 max-w-2xl text-[15px] text-muted-foreground">
          Plan campaigns, draft copy, and prepare distribution workflows. AI automation will plug
          into these modules later.
        </p>
      </div>

      <div className="mt-8 flex flex-col gap-8 lg:flex-row">
        <div className="lg:hidden">
          <div className="flex items-center gap-2 overflow-x-auto rounded-2xl border border-border bg-background p-2 text-sm">
            {navItems.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className="whitespace-nowrap rounded-full px-3 py-2 text-[12px] font-semibold text-muted-foreground transition hover:bg-muted/40 hover:text-foreground"
              >
                {item.label}
              </a>
            ))}
          </div>
        </div>

        <aside className="hidden lg:block lg:w-[220px]">
          <div className="sticky top-24 space-y-4">
            <div className="rounded-2xl border border-border bg-background p-4">
              <p className="text-[12px] uppercase tracking-[0.2em] text-muted-foreground">Sections</p>
              <nav className="mt-4 space-y-2">
                {navItems.map((item) => (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    className="flex items-center justify-between rounded-xl border border-transparent px-3 py-2 text-[13px] text-muted-foreground transition hover:border-[#907AFF]/20 hover:bg-muted/40 hover:text-foreground"
                  >
                    <span>{item.label}</span>
                    <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70">
                      {item.helper}
                    </span>
                  </a>
                ))}
              </nav>
            </div>
            <div className="rounded-2xl border border-border bg-muted/30 p-4 text-[12px] text-muted-foreground">
              Drafting area only. Connect data sources once the marketing service is ready.
            </div>
          </div>
        </aside>

        <div className="flex-1 space-y-8">
          <DashboardSection
            id="caption-portal"
            title="Caption-portal"
            description="V\u00e4lj bok och spr\u00e5k, generera captions f\u00f6r TikTok, Instagram, X eller Facebook och spara som asset."
          >
            <MarketingCaptionPortal books={initialBooks} />
          </DashboardSection>

          <DashboardSection
            id="campaigns"
            title="Campaigns"
            description="Track launches, serial drops, and promotional pushes."
            action={
              <button
                type="button"
                className="rounded-full bg-gradient-to-r from-[#907AFF] to-[#8069EE] px-4 py-2 text-[13px] font-semibold text-white transition hover:from-[#8069EE] hover:to-[#7058DD]"
                onClick={() => setShowCreateCampaign(true)}
              >
                Create campaign
              </button>
            }
          >
            <CampaignList
              campaigns={campaigns}
              state={campaignState}
              selectedCampaign={selectedCampaign}
              onSelect={handleSelectCampaign}
            />
          </DashboardSection>

          <DashboardSection
            id="content"
            title="Content generator"
            description="Draft hooks, blurbs, and social captions before publishing."
          >
            <ContentGenerator
              generators={GENERATOR_DEFAULTS}
              state={generatorState}
              bookId={initialBooks[0]?.id ?? null}
            />
          </DashboardSection>

          <DashboardSection
            id="distribution"
            title="Distribution"
            description="Choose where each campaign should publish when automation is enabled."
          >
            <DistributionChannels
              channels={channels}
              state={distributionState}
              onToggle={handleToggleChannel}
            />
          </DashboardSection>

          <DashboardSection
            id="performance"
            title="Performance"
            description="Monitor reach, clicks, and conversions as campaigns go live."
          >
            <PerformanceOverview metrics={metrics} state={performanceState} />
          </DashboardSection>

          <section id="automation" className="scroll-mt-24">
            <AutomationTeaser />
          </section>
        </div>
      </div>

      {showCreateCampaign && (
        <CampaignCreationFlow
          books={initialBooks}
          onClose={() => setShowCreateCampaign(false)}
          onCreated={handleCampaignCreated}
        />
      )}
    </div>
  );
}
