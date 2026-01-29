import PlaceholderPage from "@/components/PlaceholderPage";
import { NAV_CONFIG } from "@/nav/navConfig";

export default function Page() {
  return (
    <PlaceholderPage
      title="Library"
      variantLabel="Reader"
      links={NAV_CONFIG.APP_READER.links}
      showAuthStatus={true}
    />
  );
}
