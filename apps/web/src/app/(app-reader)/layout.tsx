import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getActiveRoleFromCookieValue } from "@/lib/active-role";
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

  if (activeRole === "author") {
    redirect("/author/home");
  }

  let user: { id: string } | null = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    redirect("/reader/signin");
  }

  if (!user) {
    redirect("/reader/signin");
  }

  return (
    <>
      <NavbarShell variant="APP_READER" />
      <OfflineModeIndicator />
      {children}
    </>
  );
}
