"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import NewsletterList from "@/components/newsletters/NewsletterList";
import WorkspaceLayout from "@/features/author-workspaces/WorkspaceLayout";
import { useAuthorWorkspace } from "@/features/author-shell/workspace-state";
import type { Book as MarketingBook } from "@/lib/marketing/types";

const MarketingPortalWizard = dynamic(
  () => import("@/components/marketing/MarketingPortalWizard"),
  {
    ssr: false,
    loading: () => <div className="h-[520px] animate-pulse rounded-3xl bg-slate-100 dark:bg-white/5" />,
  }
);

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
  const { setCurrentBookId, setContextPanelState, clearContextPanelState } = useAuthorWorkspace();
  const [selectedBookId, setSelectedBookId] = useState<string | null>(
    initialBookId ?? books[0]?.id ?? null
  );
  const [surface, setSurface] = useState(initialSurface ?? "campaigns");
  const [composerOpen, setComposerOpen] = useState(initialSurface === "reader-updates");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [creatingNewsletter, setCreatingNewsletter] = useState(false);
  const [newsletterError, setNewsletterError] = useState<string | null>(null);
  const [newsletterItems, setNewsletterItems] = useState(newsletters);

  const selectedBook = useMemo(
    () => books.find((book) => book.id === selectedBookId) ?? books[0] ?? null,
    [books, selectedBookId]
  );
  const visibleCampaigns = useMemo(
    () => campaigns.filter((campaign) => !selectedBookId || campaign.bookId === selectedBookId),
    [campaigns, selectedBookId]
  );
  const betaBooks = selectedBook ? [selectedBook] : books.slice(0, 5);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (selectedBookId) params.set("bookId", selectedBookId);
    else params.delete("bookId");
    if (surface) params.set("surface", surface);
    else params.delete("surface");
    const query = params.toString();
    const nextHref = query ? `/author/audience?${query}` : "/author/audience";
    const currentHref = `${window.location.pathname}${window.location.search}`;
    if (nextHref !== currentHref) {
      router.replace(nextHref, { scroll: false });
    }
  }, [router, searchParams, selectedBookId, surface]);

  useEffect(() => {
    setCurrentBookId(selectedBook?.id ?? null);
    setContextPanelState({
      kind: "audience",
      payload: {
        subscriberCount,
        campaignCount: visibleCampaigns.length,
        selectedBookTitle: selectedBook?.title ?? null,
        selectedBookDescription: selectedBook?.description ?? null,
        surface,
      },
    });
    return clearContextPanelState;
  }, [
    clearContextPanelState,
    selectedBook?.description,
    selectedBook?.id,
    selectedBook?.title,
    setContextPanelState,
    setCurrentBookId,
    subscriberCount,
    surface,
    visibleCampaigns.length,
  ]);

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

  return (
    <WorkspaceLayout
      header={
        <PageHeader
          eyebrow="Grow"
          title="Audience workspace"
          description="Run campaigns, send reader updates, prepare beta releases, and generate marketing assets without leaving the shell."
          actions={
            <div className="flex flex-wrap gap-2">
              <Button variant={surface === "campaigns" ? "primary" : "secondary"} size="sm" onClick={() => setSurface("campaigns")}>
                Campaign queue
              </Button>
              <Button variant={surface === "reader-updates" ? "primary" : "secondary"} size="sm" onClick={() => {
                setSurface("reader-updates");
                setComposerOpen(true);
              }}>
                Reader updates
              </Button>
              <Button variant={surface === "beta-readers" ? "primary" : "secondary"} size="sm" onClick={() => setSurface("beta-readers")}>
                Beta readers
              </Button>
              <Button variant={surface === "marketing-assets" ? "primary" : "secondary"} size="sm" onClick={() => setSurface("marketing-assets")}>
                Marketing assets
              </Button>
            </div>
          }
        />
      }
      main={
        <div className="space-y-6">
          <Card>
            <CardContent className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">Selected book</p>
                <p className="text-xs text-slate-500 dark:text-white/45">
                  Use one book context across campaigns, updates, and beta publishing.
                </p>
              </div>
              <select
                value={selectedBookId ?? ""}
                onChange={(event) => setSelectedBookId(event.target.value || null)}
                className="min-h-[44px] rounded-xl border border-slate-200 bg-white px-4 text-[14px] text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-white"
              >
                {books.map((book) => (
                  <option key={book.id} value={book.id}>
                    {book.title ?? "Untitled"}
                  </option>
                ))}
              </select>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">Campaign queue</p>
                <p className="text-xs text-slate-500 dark:text-white/45">
                  Recent launch assets and distribution-ready copy.
                </p>
              </div>
              {visibleCampaigns.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-sm text-slate-500 dark:border-white/10 dark:text-white/45">
                  No campaign output yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {visibleCampaigns.slice(0, 6).map((campaign) => (
                    <div
                      key={campaign.id}
                      className="rounded-2xl border border-slate-200 px-4 py-3 dark:border-white/10"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-slate-900 dark:text-white">
                            {campaign.bookTitle} • {campaign.channel}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-white/45">
                            {campaign.headline ?? "Generated asset"}
                          </p>
                        </div>
                        <span className="text-xs text-slate-400 dark:text-white/35">{campaign.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">Reader updates</p>
                  <p className="text-xs text-slate-500 dark:text-white/45">
                    Draft updates inline instead of opening a modal flow.
                  </p>
                </div>
                {newslettersEnabled ? (
                  <Button size="sm" variant="secondary" onClick={() => setComposerOpen((current) => !current)}>
                    {composerOpen ? "Hide composer" : "New update"}
                  </Button>
                ) : null}
              </div>

              {newslettersEnabled && composerOpen ? (
                <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
                  <input
                    type="text"
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                    placeholder="Subject line"
                    className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-white px-4 text-[14px] text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-white"
                  />
                  <textarea
                    value={bodyHtml}
                    onChange={(event) => setBodyHtml(event.target.value)}
                    rows={7}
                    placeholder="<p>What changed for your readers this week?</p>"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-[14px] text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-white"
                  />
                  {newsletterError ? <p className="text-sm text-red-600 dark:text-red-400">{newsletterError}</p> : null}
                  <div className="flex gap-2">
                    <Button size="sm" isLoading={creatingNewsletter} loadingText="Creating..." onClick={() => void handleCreateDraft()}>
                      Save draft
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setComposerOpen(false)}>
                      Collapse
                    </Button>
                  </div>
                </div>
              ) : null}

              {newslettersEnabled ? (
                <NewsletterList newsletters={newsletterItems} />
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-sm text-slate-500 dark:border-white/10 dark:text-white/45">
                  Reader updates are disabled for this environment.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">Beta readers</p>
                <p className="text-xs text-slate-500 dark:text-white/45">
                  Keep draft publishing visible and easy to manage from one inline section.
                </p>
              </div>
              <div className="space-y-2">
                {betaBooks.map((book) => (
                  <div
                    key={book.id}
                    className="flex flex-col gap-3 rounded-2xl border border-slate-200 px-4 py-3 dark:border-white/10 lg:flex-row lg:items-center lg:justify-between"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">
                        {book.title ?? "Untitled"}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-white/45">
                        {book.status === "PUBLISHED"
                          ? `Live • ${book.publishedVisibility ?? "public"}`
                          : "Draft • prepare a beta release from publish settings"}
                      </p>
                    </div>
                    <Link
                      href={`/author/audience?bookId=${book.id}&surface=beta-readers`}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-white/65 dark:hover:bg-white/5"
                    >
                      Keep inline
                    </Link>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">Marketing asset generator</p>
                  <p className="text-xs text-slate-500 dark:text-white/45">
                    Heavy preview surfaces lazy-load only when needed.
                  </p>
                </div>
                {marketingEnabled ? (
                  <Button size="sm" variant="secondary" onClick={() => setSurface("marketing-assets")}>
                    Open inline generator
                  </Button>
                ) : null}
              </div>

              {marketingEnabled && surface === "marketing-assets" ? (
                <Suspense fallback={<div className="h-[520px] animate-pulse rounded-3xl bg-slate-100 dark:bg-white/5" />}>
                  <MarketingPortalWizard
                    books={books}
                    initialBookId={selectedBook?.id ?? null}
                    embedded
                  />
                </Suspense>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-sm text-slate-500 dark:border-white/10 dark:text-white/45">
                  Open the inline generator to produce launch copy and trailer assets.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      }
    />
  );
}
