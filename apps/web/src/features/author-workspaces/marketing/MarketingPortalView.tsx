"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import WorkspaceLayout from "@/features/author-workspaces/WorkspaceLayout";
import WorkspaceHeaderActions from "@/features/author-workspaces/components/WorkspaceHeaderActions";
import { getLanguageLabel } from "@/lib/languages";
import { cn } from "@/lib/utils";
import type { CampaignWizardCompleteConfig } from "@/components/marketing/CampaignWizard";

const CampaignWizard = dynamic(
  () => import("@/components/marketing/CampaignWizard"),
  { ssr: false, loading: () => null }
);

export type PortalBook = {
  id: string;
  title: string | null;
  cover_image: string | null;
  language?: string | null;
};

export type PortalCampaign = {
  id: string;
  bookId: string;
  bookTitle: string | null;
  bookCoverUrl: string | null;
  name: string | null;
  status: string;
  template: string;
  channels: string[];
  languages: string[];
  contentTypes: string[];
  frequency: string;
  startDate: string;
  durationWeeks: number;
  mode: string;
  counts: { total: number; ready: number; posted: number };
  createdAt: string;
  updatedAt: string;
};

type Props = {
  books: PortalBook[];
  campaigns: PortalCampaign[];
  initialBookId: string | null;
  marketingEnabled: boolean;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  generating: "Generating…",
  active: "Active",
  paused: "Paused",
  finished: "Finished",
  failed: "Failed",
};

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-muted text-muted-foreground dark:bg-card dark:text-muted-foreground",
  generating: "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400",
  active: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400",
  paused: "bg-muted text-muted-foreground dark:bg-card dark:text-muted-foreground",
  finished: "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400",
  failed: "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400",
};

const CONTENT_TYPE_EMOJI: Record<string, string> = {
  text: "✍️",
  trailer: "🎬",
  podcast: "🎙️",
};

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function MarketingPortalView({
  books,
  campaigns,
  initialBookId,
  marketingEnabled,
}: Props) {
  const router = useRouter();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initialBook = useMemo(
    () => books.find((b) => b.id === initialBookId) ?? books[0] ?? null,
    [books, initialBookId]
  );

  const handleCreate = async (config: CampaignWizardCompleteConfig) => {
    setError(null);
    const res = await fetch("/api/author/marketing/campaigns", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bookId: config.bookId,
        languages: config.languages,
        contentTypes: config.contentTypes,
        channels: config.channels,
        frequency: config.frequency,
        template: config.template,
        startDate: config.startDate,
        durationWeeks: 4,
        weeklySchedule: config.schedule,
        mode: "organic",
      }),
    });

    const body = (await res.json().catch(() => ({}))) as {
      campaign?: { id: string };
      error?: string;
    };

    if (!res.ok || !body.campaign) {
      const msg = body.error ?? "Could not create campaign.";
      setError(msg);
      throw new Error(msg);
    }

    router.refresh();
    router.push(`/author/marketing/${body.campaign.id}`);
  };

  if (!marketingEnabled) {
    return (
      <WorkspaceLayout
        header={
          <header>
            <h1 className="author-page-title">
              Marketing
            </h1>
          </header>
        }
        headerRight={<WorkspaceHeaderActions />}
        main={
          <div className="rounded-2xl border border-border bg-card p-8 text-center dark:bg-card">
            <p className="text-eyebrow">Not yet enabled</p>
            <h2 className="author-section-title mt-4 text-[24px] font-medium tracking-tight text-foreground dark:text-foreground">
              Marketing is not enabled in this environment yet.
            </h2>
          </div>
        }
      />
    );
  }

  if (books.length === 0) {
    return (
      <WorkspaceLayout
        header={
          <header>
            <h1 className="author-page-title">
              Marketing
            </h1>
          </header>
        }
        headerRight={<WorkspaceHeaderActions />}
        main={
          <div className="rounded-2xl border border-border bg-card p-8 text-center dark:bg-card">
            <p className="text-eyebrow">Marketing</p>
            <h2 className="author-section-title mt-4 text-[24px] font-medium tracking-tight text-foreground dark:text-foreground">
              Add a book first
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-[15px] text-muted-foreground dark:text-muted-foreground">
              Trailers, podcast clips, and captions are generated from your
              published book. Add one and come back here.
            </p>
            <Link
              href="/author/books/new"
              className="mt-5 inline-flex items-center rounded-full bg-primary px-5 py-2.5 text-[14px] font-medium text-primary-foreground hover:bg-primary/90"
            >
              Add a book
            </Link>
          </div>
        }
      />
    );
  }

  return (
    <WorkspaceLayout
      header={
        <header>
          <h1 className="author-page-title">
            Marketing
          </h1>
        </header>
      }
      headerRight={<WorkspaceHeaderActions />}
      main={
        <div className="space-y-6">
          {/* Hero CTA */}
          <div className="rounded-2xl border border-border bg-card p-6 dark:bg-card sm:p-8">
            <p className="text-eyebrow">Campaigns</p>
            <h2 className="author-section-title mt-4 text-[28px] font-medium tracking-tight text-foreground dark:text-foreground sm:text-[32px]">
              One wizard. Trailers, clips, captions — every language.
            </h2>
            <p className="mt-2 max-w-2xl text-[15px] text-muted-foreground dark:text-muted-foreground">
              Pick a book, pick languages, pick what to publish. We build a
              week-by-week plan you can post yourself with one click.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button
                onClick={() => setWizardOpen(true)}
                className="rounded-full bg-primary px-6 text-primary-foreground hover:bg-primary/90"
              >
                Create campaign
              </Button>
              <span className="text-[13px] text-muted-foreground dark:text-muted-foreground">
                Organic now · Paid ads later
              </span>
            </div>
            {error ? (
              <p className="mt-4 text-[13px] text-red-600 dark:text-red-400">
                {error}
              </p>
            ) : null}
          </div>

          {/* Campaign list */}
          {campaigns.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-white/40 p-8 text-center dark:border-border dark:bg-card">
              <p className="text-[14px] text-muted-foreground dark:text-muted-foreground">
                No campaigns yet — start one above and we&apos;ll generate the
                weekly content drop.
              </p>
            </div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {campaigns.map((campaign) => (
                <li key={campaign.id}>
                  <Link
                    href={`/author/marketing/${campaign.id}`}
                    className={cn(
                      "block rounded-2xl border border-black/10 bg-card p-5 transition-all hover:border-[#907AFF]/40 hover:bg-[#907AFF]/[0.03]",
                      "dark:border-border dark:bg-card dark:hover:border-[#907AFF]/40 dark:hover:bg-[#907AFF]/[0.06]"
                    )}
                  >
                    <div className="flex items-start gap-3.5">
                      {campaign.bookCoverUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={campaign.bookCoverUrl}
                          alt=""
                          className="h-16 w-11 rounded-md object-cover shadow-sm"
                        />
                      ) : (
                        <div className="h-16 w-11 rounded-md bg-black/[0.05] dark:bg-card" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="truncate text-[15px] font-medium text-foreground dark:text-foreground">
                            {campaign.name ?? campaign.bookTitle ?? "Campaign"}
                          </p>
                          <span
                            className={cn(
                              "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                              STATUS_STYLES[campaign.status] ?? STATUS_STYLES.pending
                            )}
                          >
                            {STATUS_LABEL[campaign.status] ?? campaign.status}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-[13px] text-muted-foreground dark:text-muted-foreground">
                          {campaign.bookTitle ?? "—"}
                          <span className="mx-1.5 text-muted-foreground dark:text-muted-foreground">·</span>
                          {campaign.languages.map(getLanguageLabel).join(", ")}
                        </p>
                        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[12px]">
                          {campaign.contentTypes.map((ct) => (
                            <span
                              key={ct}
                              className="rounded-full bg-black/[0.04] px-2 py-0.5 text-foreground dark:bg-card dark:text-muted-foreground"
                            >
                              {CONTENT_TYPE_EMOJI[ct] ?? ""} {ct}
                            </span>
                          ))}
                        </div>
                        <div className="mt-3 flex items-center gap-3 text-[12px] text-muted-foreground dark:text-muted-foreground">
                          <span>{campaign.counts.total} posts</span>
                          <span aria-hidden="true">·</span>
                          <span>{campaign.counts.posted} posted</span>
                          <span aria-hidden="true">·</span>
                          <span>Starts {formatDate(campaign.startDate)}</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {/* Wizard */}
          <CampaignWizard
            open={wizardOpen}
            onOpenChange={setWizardOpen}
            books={books}
            initialBookId={initialBook?.id ?? null}
            onComplete={handleCreate}
          />
        </div>
      }
    />
  );
}
