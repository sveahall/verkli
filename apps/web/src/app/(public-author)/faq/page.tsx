<<<<<<< HEAD
import { redirect } from "next/navigation";

export default function FaqPage() {
  redirect("/author");
=======
import PlaceholderPage from "@/components/PlaceholderPage";
import { NAV_CONFIG } from "@/nav/navConfig";

export default function Page() {
  return (
    <PlaceholderPage
      title="FAQ"
      variantLabel="verkli"
      links={NAV_CONFIG.PUBLIC_AUTHOR.links}
      showAuthStatus={false}
    />
  );
>>>>>>> main
}
