<<<<<<< HEAD
import { redirect } from "next/navigation";

export default function AuthorCommunityPage() {
  redirect("/author/home");
=======
import PlaceholderPage from "@/components/PlaceholderPage";
import { NAV_CONFIG } from "@/nav/navConfig";

export default function Page() {
  return (
    <PlaceholderPage
      title="Community"
      variantLabel="Author"
      links={NAV_CONFIG.APP_AUTHOR.links}
      showAuthStatus={true}
    />
  );
>>>>>>> main
}
