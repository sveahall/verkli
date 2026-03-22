import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getActiveRoleFromCookieValue } from "@/lib/active-role";
import {
  getAuthorApplicationStatus,
  isLegacyAuthorRole,
} from "@/lib/auth/author-approval";
import AuthorAppShell from "@/features/author-shell/AuthorAppShell";

export default async function AppAuthorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const activeRole = getActiveRoleFromCookieValue(
    cookieStore.get("active_role")?.value
  );

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
  const profileRole = String(profile?.role ?? "").trim().toLowerCase();
  const isAdmin = profileRole === "admin";
  const isLegacyAuthor = isLegacyAuthorRole(profileRole);
  const approvalStatus = !isAdmin && !isLegacyAuthor
    ? await getAuthorApplicationStatus(supabase, user.id)
    : null;
  const canAccessAuthor = isAdmin || isLegacyAuthor || approvalStatus === "approved";

  if (!canAccessAuthor) {
    redirect("/reader/home");
  }

  if (!activeRole && !isAdmin) {
    redirect("/api/auth/sync-role?redirect=/author/home");
  }

  return (
    <AuthorAppShell>{children}</AuthorAppShell>
  );
}
