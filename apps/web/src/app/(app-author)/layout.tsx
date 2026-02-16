import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getActiveRoleFromCookieValue } from "@/lib/active-role";
import {
  getAuthorApplicationStatus,
  isLegacyAuthorRole,
} from "@/lib/auth/author-approval";
import NavbarShell from "@/nav/NavbarShell";

export default async function AppAuthorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const activeRole = getActiveRoleFromCookieValue(
    cookieStore.get("active_role")?.value
  );

  if (!activeRole) {
    redirect("/api/auth/sync-role?redirect=/author/home");
  }

  if (activeRole === "reader") {
    redirect("/reader/home");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/author/signin");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile?.role) {
    redirect("/author/signin");
  }

  const isLegacyAuthor = isLegacyAuthorRole(profile.role);

  if (!isLegacyAuthor) {
    const approvalStatus = await getAuthorApplicationStatus(supabase, user.id);
    if (approvalStatus !== "approved") {
      redirect("/reader/home?error=author_required");
    }
  }

  return (
    <>
      <NavbarShell variant="APP_AUTHOR" />
      {children}
    </>
  );
}
