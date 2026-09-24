import { notFound } from "next/navigation";
import MarketingPortalView from "@/features/author-workspaces/marketing/MarketingPortalView";

export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <div className="mx-auto max-w-[1440px]">
    <p className="bg-accent/40 px-6 py-2 text-sm">Development preview · Sample books. Saving and generation require an author session.</p>
    <MarketingPortalView marketingEnabled initialBookId="11111111-1111-4111-8111-111111111111" campaigns={[]} books={[
      { id: "11111111-1111-4111-8111-111111111111", title: "The Paper Boat", cover_image: null, language: "en", description: "A young girl folds a paper boat and follows it downstream, discovering the stories of the people who live along the river." },
      { id: "22222222-2222-4222-8222-222222222222", title: "Another Story", cover_image: null, language: "sv", description: "A story of friendship in a small coastal town." },
    ]} />
  </div>;
}
