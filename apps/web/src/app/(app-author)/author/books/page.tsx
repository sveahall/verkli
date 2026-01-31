import PlaceholderPage from "@/components/PlaceholderPage";
import { NAV_CONFIG } from "@/nav/navConfig";

export default function Page() {
  return (
    <PlaceholderPage
      title="Books"
      variantLabel="Author"
      links={NAV_CONFIG.APP_AUTHOR.links}
      showAuthStatus={true}
    />
  );
}
