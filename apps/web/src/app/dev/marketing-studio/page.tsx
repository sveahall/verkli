import Link from "next/link";
import { notFound } from "next/navigation";
import MarketingPortalView from "@/features/author-workspaces/marketing/MarketingPortalView";

import CampaignDetailView from "@/features/author-workspaces/marketing/CampaignDetailView";

export default async function Page({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  if ((await searchParams).view === "campaign") return <div><Link href="/dev/marketing-studio">Open studio preview</Link><CampaignDetailView campaign={{
    id: "preview-campaign", bookId: "11111111-1111-4111-8111-111111111111", bookTitle: "The Paper Boat", bookCoverUrl: null,
    name: "Private review", status: "active", template: "launch", channels: ["instagram"], languages: ["en"], contentTypes: ["podcast"],
    frequency: "low", startDate: "2026-09-28", durationWeeks: 1, mode: "organic", generationError: null,
  }} posts={[{
    id: "preview-post", scheduledFor: "2026-09-28T12:00:00Z", channel: "instagram", language: "en", contentType: "podcast", status: "draft",
    headline: null, caption: "A paper boat on the river.", hashtags: "#Books", cta: null, shareUrl: null, mediaAssetId: null, mediaAssetUrl: null,
    assetError: null, postedAt: null, postedUrl: null, updatedAt: "2026-09-24T10:00:00Z", mode: "organic",
  }]} /></div>;
  return <div className="mx-auto max-w-[1440px]">
    <p className="bg-accent/40 px-6 py-2 text-sm">Development preview · Sample books. Saving and generation require an author session.</p>
    <MarketingPortalView marketingEnabled initialBookId="11111111-1111-4111-8111-111111111111" campaigns={[]} books={[
      { id: "11111111-1111-4111-8111-111111111111", title: "The Paper Boat", cover_image: null, language: "en", description: "A young girl folds a paper boat and follows it downstream, discovering the stories of the people who live along the river." },
      { id: "22222222-2222-4222-8222-222222222222", title: "Another Story", cover_image: null, language: "sv", description: "A story of friendship in a small coastal town." },
    ]} />
  </div>;
}
