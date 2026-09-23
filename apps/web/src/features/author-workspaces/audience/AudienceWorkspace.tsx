"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import NewsletterList from "@/components/newsletters/NewsletterList";
import { useAuthorWorkspace } from "@/features/author-shell/workspace-state";
import WorkspaceLayout from "@/features/author-workspaces/WorkspaceLayout";
import WorkspaceHeaderActions from "@/features/author-workspaces/components/WorkspaceHeaderActions";
import type { Book as MarketingBook } from "@/lib/marketing/types";

type AudienceSurface = "campaigns" | "reader-updates" | "beta-readers";

type AudienceBook = MarketingBook & {
  status: string;
  publishedVisibility: string | null;
  updatedAt: string | null;
};

type AudienceCampaign = {
  id: string;
  bookId: string;
  bookTitle: string;
  channel: string;
  status: string;
  headline: string | null;
  updatedAt: string | null;
  shareUrl: string | null;
};

type NewsletterItem = {
  id: string;
  subject: string;
  status: string;
  sent_at: string | null;
  recipient_count: number;
  created_at: string;
};

type AudienceWorkspaceProps = {
  books: AudienceBook[];
  campaigns: AudienceCampaign[];
  newsletters: NewsletterItem[];
  subscriberCount: number;
  initialBookId: string | null;
  initialSurface: string | null;
  marketingEnabled: boolean;
  newslettersEnabled: boolean;
};

const CHANNEL_LABELS: Record<string, string> = {
  generic: "General",
  tiktok: "TikTok",
  instagram: "Instagram",
  x: "X",
};

const STATUS_STYLES: Record<string, string> = {
  generated:
    "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400",
  active:
    "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400",
  scheduled: "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400",
  draft: "bg-muted text-muted-foreground dark:bg-card dark:text-muted-foreground",
  finished: "bg-muted text-muted-foreground dark:bg-card dark:text-muted-foreground",
};

const AUDIENCE_SURFACE_META: Record<
  AudienceSurface,
  { title: string; description: string; primaryLabel: string }
> = {
  campaigns: {
    title: "Campaigns",
    description: "Create the next campaign and keep active outreach in one list.",
    primaryLabel: "Create campaign",
  },
  "reader-updates": {
    title: "Reader updates",
    description: "Write simple updates for subscribers and keep drafts visible.",
    primaryLabel: "Write update",
  },
  "beta-readers": {
    title: "Beta readers",
    description: "Review book visibility and open beta settings for the current title.",
    primaryLabel: "Open beta settings",
  },
};

function normalizeAudienceSurface(value: string | null | undefined): AudienceSurface {
  if (value === "reader-updates") return "reader-updates";
  if (value === "beta-readers") return "beta-readers";
  return "campaigns";
}

function formatRelativeDate(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(dateStr).toLocaleDateString("en-GB");
}

function formatUpdatedAt(value: string | null): string {
  if (!value) return "Not updated yet";
  return `Updated ${new Date(value).toLocaleDateString("en-GB")}`;
}

export default function AudienceWorkspace({
  books,
  campaigns,
  newsletters,
  subscriberCount,
  initialBookId,
  initialSurface,
  marketingEnabled,
  newslettersEnabled,
}: AudienceWorkspaceProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setCurrentBookId } = useAuthorWorkspace();

  const rawSurface = searchParams.get("surface") ?? initialSurface;
  const surface = normalizeAudienceSurface(rawSurface);
  const surfaceMeta = AUDIENCE_SURFACE_META[surface];

  const [selectedBookId, setSelectedBookId] = useState<string | null>(
    initialBookId ?? books[0]?.id ?? null
  );
  const [composerOpen, setComposerOpen] = useState(surface === "reader-updates");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [creatingNewsletter, setCreatingNewsletter] = useState(false);
  const [newsletterError, setNewsletterError] = useState<string | null>(null);
  const [newsletterItems, setNewsletterItems] = useState(newsletters);
  const selectedBook = useMemo(
    () => books.find((book) => book.id === selectedBookId) ?? books[0] ?? null,
    [books, selectedBookId]
  );

  const activeCampaigns = useMemo(
    () =>
      campaigns.filter(
        (campaign) =>
          (!selectedBookId || campaign.bookId === selectedBookId) &&
          (campaign.status === "active" ||
            campaign.status === "scheduled" ||
            campaign.status === "generated")
      ),
    [campaigns, selectedBookId]
  );

  useEffect(() => {
    const nextBookId =
      searchParams.get("bookId")?.trim() ||
      searchParams.get("book")?.trim() ||
      initialBookId ||
      books[0]?.id ||
      null;

    setSelectedBookId((current) => (current === nextBookId ? current : nextBookId));
  }, [books, initialBookId, searchParams]);

  useEffect(() => {
    if (surface !== "reader-updates") {
      setComposerOpen(false);
    }
  }, [surface]);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (selectedBookId) params.set("bookId", selectedBookId);
    else params.delete("bookId");
    params.set("surface", surface);

    const query = params.toString();
    const nextHref = query ? `/author/audience?${query}` : "/author/audience";
    const currentHref = `${window.location.pathname}${window.location.search}`;
    if (nextHref !== currentHref) {
      router.replace(nextHref, { scroll: false });
    }
  }, [router, searchParams, selectedBookId, surface]);

  useEffect(() => {
    setCurrentBookId(selectedBook?.id ?? null);
  }, [selectedBook?.id, setCurrentBookId]);

  const handleCreateDraft = async () => {
    setCreatingNewsletter(true);
    setNewsletterError(null);
    try {
      const response = await fetch("/api/newsletters", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: subject.trim() || "New reader update",
          bodyHtml,
          bodyText: bodyHtml.replace(/<[^>]*>/g, ""),
        }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        newsletter?: NewsletterItem;
      };

      if (!response.ok || !body.newsletter) {
        setNewsletterError(body.error ?? "Could not create reader update.");
        return;
      }

      setNewsletterItems((current) => [body.newsletter!, ...current]);
      setSubject("");
      setBodyHtml("");
      setComposerOpen(false);
      router.refresh();
    } catch {
      setNewsletterError("Could not create reader update.");
    } finally {
      setCreatingNewsletter(false);
    }
  };

  const pageAction = (() => {
    if (surface === "campaigns" && marketingEnabled) {
      return (
        <Link
          className="inline-flex items-center rounded-full bg-primary px-5 py-2 text-[14px] font-medium text-primary-foreground hover:bg-primary/90"
          href={
            selectedBook?.id
              ? `/author/marketing?bookId=${selectedBook.id}`
              : "/author/marketing"
          }
        >
          {surfaceMeta.primaryLabel}
        </Link>
      );
    }

    if (surface === "reader-updates" && newslettersEnabled) {
      return (
        <Button
          className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={() => setComposerOpen(true)}
        >
          {surfaceMeta.primaryLabel}
        </Button>
      );
    }

    if (surface === "beta-readers" && selectedBook) {
      return (
        <Button
          className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={() => router.push(`/author/books/${selectedBook.id}?panel=publish`)}
        >
          {surfaceMeta.primaryLabel}
        </Button>
      );
    }

    return null;
  })();

  const renderCampaigns = () => (
    <div className="space-y-5">
      {/* Hero card → routes to the proper marketing portal */}
      <div className="rounded-2xl border border-border bg-card p-6 dark:bg-card sm:p-8">
        <p className="text-eyebrow">Campaigns</p>
        <h2 className="author-section-title mt-4 text-[30px] font-medium tracking-tight text-foreground dark:text-foreground">
          Create campaign
        </h2>
        <p className="mt-2 text-[15px] text-muted-foreground dark:text-muted-foreground">
          Build an AI-powered content drop for{" "}
          {selectedBook?.title ?? "your book"} — trailers, podcast clips, and
          captions in every language.
        </p>
        {marketingEnabled && (
          <Link
            className="mt-5 inline-flex items-center rounded-xl bg-primary px-6 py-2.5 text-[14px] font-medium text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.98]"
            href={
              selectedBook?.id
                ? `/author/marketing?bookId=${selectedBook.id}`
                : "/author/marketing"
            }
          >
            Open marketing portal
          </Link>
        )}
      </div>

      {/* Active campaigns list */}
      <section>
        <p className="text-eyebrow">Active</p>
        <h2 className="author-section-title mt-2 text-section-title">Live campaigns</h2>
        {activeCampaigns.length === 0 ? (
          <p className="mt-5 text-sm text-muted-foreground dark:text-muted-foreground">
            No active campaigns yet.
          </p>
        ) : (
          <div className="mt-5 rounded-2xl border border-border bg-card dark:bg-card">
            <div className="divide-y divide-border/80 p-5 dark:divide-border">
              {activeCampaigns.map((campaign) => (
                <div key={campaign.id} className="flex flex-wrap items-start gap-4 py-4 first:pt-0">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground dark:text-foreground">
                      {campaign.headline ?? "Campaign"}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground dark:text-muted-foreground">
                      {campaign.bookTitle}
                      <span className="mx-1.5 text-muted-foreground dark:text-muted-foreground">·</span>
                      {CHANNEL_LABELS[campaign.channel] ?? campaign.channel}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                      STATUS_STYLES[campaign.status] ?? STATUS_STYLES.draft
                    }`}
                  >
                    {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
                  </span>
                  <span className="text-xs text-muted-foreground dark:text-muted-foreground">
                    {campaign.updatedAt ? formatRelativeDate(campaign.updatedAt) : "Recently updated"}
                  </span>
                  {campaign.shareUrl ? (
                    <a
                      href={campaign.shareUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-foreground hover:text-muted-foreground dark:text-foreground dark:hover:text-foreground"
                    >
                      Preview
                    </a>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );

  const renderReaderUpdates = () => (
    <div className="space-y-5">
      {subscriberCount > 0 ? (
        <p className="text-sm text-muted-foreground dark:text-muted-foreground">
          {subscriberCount.toLocaleString("en-US")}{" "}
          {subscriberCount === 1 ? "subscriber" : "subscribers"} will receive your next update.
        </p>
      ) : null}

      {newslettersEnabled && composerOpen ? (
        <div className="rounded-2xl border border-border bg-card p-5 dark:bg-card">
          <div className="space-y-3">
            <input
              type="text"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="Subject line"
              className="input-base text-[14px]"
            />
            <textarea
              value={bodyHtml}
              onChange={(event) => setBodyHtml(event.target.value)}
              rows={6}
              placeholder="Write your update..."
              className="input-base resize-y text-[14px]"
            />
            {newsletterError ? (
              <p className="text-[13px] text-red-600 dark:text-red-400">
                {newsletterError}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
                isLoading={creatingNewsletter}
                loadingText="Creating..."
                onClick={() => void handleCreateDraft()}
              >
                Save draft
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setComposerOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <section>
        <p className="text-eyebrow">Reader updates</p>
        <h2 className="author-section-title mt-2 text-section-title">Drafts and sent updates</h2>
        {newslettersEnabled ? (
          newsletterItems.length > 0 ? (
            <div className="mt-5">
              <NewsletterList newsletters={newsletterItems} />
            </div>
          ) : (
            <p className="mt-5 text-sm text-muted-foreground dark:text-muted-foreground">
              No reader updates yet.
            </p>
          )
        ) : (
          <p className="mt-5 text-sm text-muted-foreground dark:text-muted-foreground">
            Reader updates are not enabled in this environment.
          </p>
        )}
      </section>
    </div>
  );

  const renderBetaReaders = () => (
    <div className="rounded-2xl border border-border bg-card p-6 dark:bg-card sm:p-8">
      <p className="text-eyebrow">Beta readers</p>
      <h2 className="author-section-title mt-2 text-section-title">
        {selectedBook?.title ?? "No book selected"}
      </h2>
      <div className="mt-5 space-y-3">
        <p className="text-sm text-muted-foreground dark:text-muted-foreground">
          {selectedBook?.status === "PUBLISHED"
            ? `Current visibility: ${selectedBook.publishedVisibility ?? "public"}`
            : "This book is still a draft. Open publish settings when you are ready for beta readers."}
        </p>
        <p className="text-sm text-muted-foreground dark:text-muted-foreground">
          {formatUpdatedAt(selectedBook?.updatedAt ?? null)}
        </p>
        {selectedBook ? (
          <Link
            href={`/author/books/${selectedBook.id}?panel=publish`}
            className="inline-flex min-h-[40px] items-center rounded-full border border-border px-4 text-[14px] font-medium text-foreground transition hover:border-border hover:text-foreground dark:border-border dark:text-muted-foreground dark:hover:border-border dark:hover:text-foreground"
          >
            Open beta settings
          </Link>
        ) : null}
      </div>
    </div>
  );

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
        books.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center dark:bg-card sm:p-10">
            <p className="text-eyebrow">Audience</p>
            <h2 className="author-section-title mt-4 text-[30px] font-medium tracking-tight text-foreground dark:text-foreground">
              Create a book before you grow an audience around it
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-muted-foreground dark:text-muted-foreground">
              Campaigns, updates, and beta readers become useful once a story exists.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Book selector and action row */}
            <div className="flex flex-wrap items-center gap-3">
              {books.length > 1 ? (
                <select
                  value={selectedBookId ?? ""}
                  onChange={(event) => setSelectedBookId(event.target.value || null)}
                  className="h-11 min-w-[160px] rounded-full border-0 bg-card px-4 text-[14px] text-muted-foreground outline-none ring-1 ring-border/80 focus:ring-2 focus:ring-[#907AFF]/30 dark:bg-card dark:text-muted-foreground dark:ring-white/10"
                  aria-label="Select book"
                >
                  {books.map((book) => (
                    <option key={book.id} value={book.id}>
                      {book.title ?? "Untitled"}
                    </option>
                  ))}
                </select>
              ) : null}
              {pageAction}
            </div>

            {surface === "campaigns"
              ? renderCampaigns()
              : surface === "reader-updates"
                ? renderReaderUpdates()
                : renderBetaReaders()}
          </div>
        )
      }
    />
  );
}
