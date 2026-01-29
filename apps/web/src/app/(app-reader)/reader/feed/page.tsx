import PlaceholderPage from "@/components/PlaceholderPage";
import { NAV_CONFIG } from "@/nav/navConfig";

export default function ReaderFeedPage() {
  return (
    <PlaceholderPage
      title="Feed"
      variantLabel="Reader"
      links={NAV_CONFIG.APP_READER.links}
      showAuthStatus
    />
  );
}
