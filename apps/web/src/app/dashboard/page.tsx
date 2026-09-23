import { redirect } from "next/navigation";

// Collapse the legacy `/dashboard → /author/dashboard → /author/home` chain
// into a single redirect. The visible flash from two hops was pure tax.
export default function DashboardRedirect() {
  redirect("/author/home");
}
