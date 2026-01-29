import PlaceholderPage from "@/components/PlaceholderPage";
import { NAV_CONFIG } from "@/nav/navConfig";

export default function ReaderHomePage() {
  return (
    <PlaceholderPage
      title="Reader dashboard"
      variantLabel="Reader"
      links={NAV_CONFIG.APP_READER.links}
      showAuthStatus
    />
  );
}
