import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updateActiveRole } from "@/features/auth/roles";
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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/author/signin");
  }

  let role: "author" | "reader" | null = null;

  const metaRole = user.user_metadata?.active_role ?? user.user_metadata?.role;
  if (metaRole === "author" || metaRole === "reader") {
    role = metaRole;
  }

  if (!role) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, preferences")
      .eq("user_id", user.id)
      .maybeSingle();

    const preferenceRole = (profile?.preferences as { active_role?: string } | null)?.active_role;
    if (preferenceRole === "author" || preferenceRole === "reader") {
      role = preferenceRole;
    } else if (profile?.role === "author" || profile?.role === "reader") {
      role = profile.role;
    }
  }

  if (!role) {
    redirect("/author/signin");
  }

  // SECURITY: allow legacy authors OR approved applications.
  const originalRole = user.user_metadata?.role as string | undefined;
  const profileRole = (() => {
    if (role === "author" || role === "reader") return role;
    return null;
  })();
  const isLegacyAuthor =
    isLegacyAuthorRole(profileRole) || isLegacyAuthorRole(originalRole);

  if (!isLegacyAuthor) {
    const approvalStatus = await getAuthorApplicationStatus(supabase, user.id);
    if (approvalStatus !== "approved") {
      redirect("/reader/home?error=author_required");
    }
  }

  // If an approved user is currently in reader mode, switch to author.
  if (role === "reader") {
    await updateActiveRole("author");
  }

  const variant = "APP_AUTHOR";

  return (
    <>
      <NavbarShell variant={variant} />
      {children}
    </>
  );
}
