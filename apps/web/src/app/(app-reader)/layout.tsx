import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getActiveRoleFromCookieValue } from "@/lib/active-role";
import {
  getAuthorApplicationStatus,
  isLegacyAuthorRole,
} from "@/lib/auth/author-approval";
import NavbarShell from "@/nav/NavbarShell";
import OfflineModeIndicator from "@/components/offline/OfflineModeIndicator";

export default async function AppReaderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const activeRole = getActiveRoleFromCookieValue(
    cookieStore.get("active_role")?.value
  );

  if (!activeRole) {
    redirect("/api/auth/sync-role?redirect=/reader/home");
  }

  let user: { id: string } | null = null;
  let supabase: Awaited<ReturnType<typeof createClient>> | null = null;
  try {
    supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    redirect("/reader/signin");
  }

  if (!user || !supabase) {
    redirect("/reader/signin");
  }

  if (activeRole === "author") {
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

    console.log("[reader guard] app-reader layout role check", {
      userId: user.id,
      profileRole,
      activeRole,
      approvalStatus,
      canAccessAuthor,
    });

    if (canAccessAuthor) {
      redirect("/author/home");
    }
  }

  return (
    <>
      <NavbarShell variant="APP_READER" />
      <OfflineModeIndicator />
      {children}
    </>
  );
}
