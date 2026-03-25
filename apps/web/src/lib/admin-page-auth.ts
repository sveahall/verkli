import { redirect } from "next/navigation";
import { requireAdminRole } from "@/lib/admin-auth";

export async function requireAdminPageAccess() {
  const result = await requireAdminRole();
  if (result.ok) {
    return result.user;
  }

  if (result.status === 401) {
    redirect("/reader/signin");
  }

  if (result.profileRole === "author") {
    redirect("/author/home?error=admin_required");
  }

  redirect("/reader/home?error=admin_required");
}
