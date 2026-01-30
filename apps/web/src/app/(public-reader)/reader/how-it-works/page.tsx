import PlaceholderPage from "@/components/PlaceholderPage";
import { NAV_CONFIG } from "@/nav/navConfig";

export default function Page() {
  return (
    <PlaceholderPage
      title="How it works"
      variantLabel="Reader"
      links={NAV_CONFIG.PUBLIC_READER.links}
      showAuthStatus={false}
    />
  );
}
