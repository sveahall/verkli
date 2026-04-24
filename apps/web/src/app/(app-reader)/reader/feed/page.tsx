import { PageHeader } from "@/components/ui/page-header";
import EmptyState from "@/components/reader/EmptyState";

// The feed is not a real product surface yet — links from older promos used
// to land here and be silently redirected to /reader/home, which meant the
// user could never tell whether the feature existed or where their bookmark
// went. Render an honest "coming soon" state instead.
export default function ReaderFeedPage() {
  return (
    <div className="section-gap">
      <PageHeader
        eyebrow="Community"
        title="Feed"
        description="Activity from authors and readers you follow."
      />
      <EmptyState
        title="Feed isn't live yet"
        description="We're still building the activity feed. In the meantime, head back to discover or your library."
      />
    </div>
  );
}
