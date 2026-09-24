"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import WorkspaceLayout from "@/features/author-workspaces/WorkspaceLayout";
import WorkspaceHeaderActions from "@/features/author-workspaces/components/WorkspaceHeaderActions";
import { getLanguageLabel } from "@/lib/languages";
import MarketingStudio from "./MarketingStudio";
import { CLOSED_BETA_MESSAGE } from "@/lib/marketing/beta-policy";
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
  description?: string | null;
  trailer_status?: string | null;
  trailer_url?: string | null;
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
  loadError?: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  generating: "Generating…",
  active: "Drafts generated",
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
  loadError,
}: Props) {
  const router = useRouter();
  const [selectedBookId, setSelectedBookId] = useState(initialBookId ?? books[0]?.id ?? null);
  const [activeTab, setActiveTab] = useState<"studio" | "campaigns">("studio");
  const [dirty, setDirty] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initialBook = useMemo(
    () => books.find((b) => b.id === selectedBookId) ?? books[0] ?? null,
    [books, selectedBookId]
  );

  const visibleCampaigns = campaigns.filter(campaign => campaign.bookId === initialBook?.id);

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
        durationWeeks: config.durationWeeks,
        weeklySchedule: config.schedule,
        mode: "organic",
      }),
    });

    const body = (await res.json().catch(() => ({}))) as {
      campaign?: { id: string };
      error?: string;
      detail?: unknown;
    };

    if (!res.ok || !body.campaign) {
      const msg = typeof body.detail === "string" ? body.detail : body.error ?? "Could not create campaign.";
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

  if (books.length === 0 && !loadError) {
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
              Prepare captions, trailers and campaign plans from a draft book.
              Start with a title and description; no publication is needed.
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
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-accent/30 px-5 py-4">
            <span className="shrink-0 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">Closed beta</span>
            <p className="text-sm text-muted-foreground">{CLOSED_BETA_MESSAGE}</p>
          </div>
          {loadError ? <div role="alert" className="rounded-2xl border border-border p-5"><p>{loadError}</p><Button variant="ghost" onClick={() => router.refresh()}>Retry loading marketing</Button></div> : null}
          <div className="flex flex-col items-stretch justify-between gap-4 sm:flex-row sm:items-end">
            <label className="min-w-0 flex-1 space-y-2 text-sm font-medium" htmlFor="marketing-book">Your book
              <select id="marketing-book" value={initialBook?.id ?? ""} className="input-base block w-full max-w-lg" onChange={event => {
                if (dirty && !window.confirm("Switch books and discard your unsaved draft?")) return;
                setDirty(false); setSelectedBookId(event.target.value);
                const url = new URL(window.location.href); url.searchParams.set("bookId", event.target.value); window.history.replaceState(null, "", url);
              }}>{books.map(book => <option key={book.id} value={book.id}>{book.title || "Untitled book"}</option>)}</select>
            </label>
            <Button className="w-full sm:w-auto" disabled={!initialBook} onClick={() => setWizardOpen(true)}>Create campaign plan</Button>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm"><Link href="/author/marketing/ads" className="text-accent-foreground underline underline-offset-4">Ad drafts & budgets</Link><Link href="/author/marketing/channels" className="text-muted-foreground underline underline-offset-4">Channel connections</Link></div>
          <div className="flex gap-2 border-b border-border pb-3" role="tablist" aria-label="Marketing workspace">
            {([ ["studio", "Create & save material"], ["campaigns", `Campaign plans (${visibleCampaigns.length})`] ] as const).map(([id, label]) => <button key={id} id={`marketing-tab-${id}`} type="button" role="tab" aria-selected={activeTab === id} aria-controls={`marketing-panel-${id}`} onClick={() => setActiveTab(id)} className={cn("min-h-11 rounded-full px-5 text-sm font-medium", activeTab === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}>{label}</button>)}
          </div>
          <div id="marketing-panel-studio" role="tabpanel" aria-labelledby="marketing-tab-studio" hidden={activeTab !== "studio"}>
            {initialBook ? <MarketingStudio key={initialBook.id} book={initialBook} onDirtyChange={setDirty} /> : null}
          </div>
          <section id="marketing-panel-campaigns" role="tabpanel" aria-labelledby="marketing-tab-campaigns" hidden={activeTab !== "campaigns"} className="space-y-5">
            <div><h2 className="text-section-title">Your campaign calendar</h2><p className="mt-2 text-sm text-muted-foreground">Plan a sequence of drafts, generate the copy, then review each post. Calendar dates are for your plan; nothing is sent to social media.</p></div>
          {/* Campaign list */}
          {visibleCampaigns.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-white/40 p-8 text-center dark:border-border dark:bg-card">
              <p className="text-[14px] text-muted-foreground dark:text-muted-foreground">
                No campaign plan for this book yet. Create one to choose your
                channels, languages and a draft calendar.
              </p>
            </div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {visibleCampaigns.map((campaign) => (
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
                          <span>{campaign.counts.ready} approved</span>
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

          </section>
          {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}

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
