import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updateActiveRole } from "@/features/auth/roles";
import NavbarShell from "@/nav/NavbarShell";
import OfflineModeIndicator from "@/components/offline/OfflineModeIndicator";

export default async function AppReaderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/reader/signin");
  }

  // SECURITY: Always resolve role from DB — never trust user_metadata.role.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, preferences")
    .eq("user_id", user.id)
    .maybeSingle();

  let role: "author" | "reader" | null = null;
  const preferenceRole = (profile?.preferences as { active_role?: string } | null)?.active_role;
  if (preferenceRole === "author" || preferenceRole === "reader") {
    role = preferenceRole;
  } else if (profile?.role === "author" || profile?.role === "reader") {
    role = profile.role;
  }

  if (!role) {
    redirect("/reader/signin");
  }

  if (role === "author") {
    await updateActiveRole("reader");
  }

  return (
    <>
      <NavbarShell variant="APP_READER" />
      <OfflineModeIndicator />
      {children}
    </>
  );
}
