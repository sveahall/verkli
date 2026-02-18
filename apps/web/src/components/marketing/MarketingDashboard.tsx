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
  { id: "caption-portal", label: "Caption portal", helper: "Generate & save" },
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
    <section id={id} className="scroll-mt-28">
      <div
        className="rounded-3xl border border-white/60 bg-white/70 p-6 shadow-[0_0_0_1px_rgba(0,0,0,0.02),0_25px_50px_-12px_rgba(0,0,0,0.08)] backdrop-blur-xl dark:border-white/10 dark:bg-white/10 dark:shadow-[0_0_0_1px_rgba(255,255,255,0.05),0_25px_50px_-12px_rgba(0,0,0,0.4)] sm:p-8"
        style={{ WebkitBackdropFilter: "blur(24px)", backdropFilter: "blur(24px)" }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-foreground sm:text-[20px]">{title}</h2>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
          </div>
          {action ? <div className="flex items-center gap-2">{action}</div> : null}
        </div>
        <div className="mt-8">{children}</div>
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
    <div className="relative mx-auto w-full max-w-[1280px] px-5 py-12 sm:px-6 lg:px-10">
      <header className="mb-10">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Marketing tools
        </p>
        <h1 className="mt-2 text-[28px] font-bold tracking-[-0.02em] text-foreground sm:text-[32px]">
          Marketing dashboard
        </h1>
        <p className="mt-3 max-w-xl text-[15px] leading-[1.5] text-muted-foreground">
          Plan campaigns, draft copy, and prepare distribution workflows. AI automation will plug
          into these modules later.
        </p>
      </header>

      <div className="flex flex-col gap-10 lg:flex-row">
        <div className="lg:hidden">
          <nav
            className="flex gap-1 overflow-x-auto rounded-2xl border border-white/60 bg-white/60 p-1.5 shadow-[0_0_0_1px_rgba(0,0,0,0.04)] backdrop-blur-xl dark:border-white/10 dark:bg-white/10"
            style={{ WebkitBackdropFilter: "blur(24px)", backdropFilter: "blur(24px)" }}
          >
            {navItems.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className="whitespace-nowrap rounded-xl px-4 py-2.5 text-[13px] font-medium text-muted-foreground transition hover:bg-white/80 hover:text-foreground dark:hover:bg-white/15 dark:hover:text-white"
              >
                {item.label}
              </a>
            ))}
          </nav>
        </div>

        <aside className="hidden shrink-0 lg:block lg:w-[240px]">
          <div className="sticky top-28 space-y-5">
            <nav
              className="rounded-2xl border border-white/60 bg-white/60 p-3 shadow-[0_0_0_1px_rgba(0,0,0,0.04),0_8px_30px_rgba(0,0,0,0.06)] backdrop-blur-xl dark:border-white/10 dark:bg-white/10 dark:shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_8px_30px_rgba(0,0,0,0.3)]"
              style={{ WebkitBackdropFilter: "blur(24px)", backdropFilter: "blur(24px)" }}
            >
              <p className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Sections
              </p>
              <div className="mt-1 space-y-0.5">
                {navItems.map((item) => (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    className="flex items-center justify-between rounded-xl px-3 py-2.5 text-[13px] text-muted-foreground transition hover:bg-[#907AFF]/10 hover:text-foreground dark:hover:bg-[#907AFF]/15"
                  >
                    <span className="font-medium">{item.label}</span>
                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground/60">
                      {item.helper}
                    </span>
                  </a>
                ))}
              </div>
            </nav>
            <p
              className="rounded-xl border border-white/50 bg-white/50 px-3.5 py-2.5 text-[12px] leading-snug text-muted-foreground backdrop-blur-xl dark:border-white/10 dark:bg-white/5"
              style={{ WebkitBackdropFilter: "blur(20px)", backdropFilter: "blur(20px)" }}
            >
              Drafting area only. Connect data sources once the marketing service is ready.
            </p>
          </div>
        </aside>

        <div className="min-w-0 flex-1 space-y-10">
          <DashboardSection
            id="caption-portal"
            title="Caption portal"
            description="Choose a book and language, generate captions for TikTok, Instagram, X, or Facebook, and save as assets."
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
                className="rounded-full bg-gradient-to-r from-[#907AFF] to-[#8069EE] px-4 py-2 text-[13px] font-semibold text-white shadow-[0_2px_12px_rgba(144,122,255,0.4)] transition hover:from-[#8069EE] hover:to-[#7058DD] hover:shadow-[0_4px_20px_rgba(144,122,255,0.35)]"
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

          <section id="automation" className="scroll-mt-28">
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
