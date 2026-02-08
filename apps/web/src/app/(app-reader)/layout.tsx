import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updateActiveRole } from "@/features/auth/roles";
import NavbarShell from "@/nav/NavbarShell";

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
    redirect("/reader/signin");
  }

  if (role === "author") {
    await updateActiveRole("reader");
  }

  return (
    <>
      <NavbarShell variant="APP_READER" />
      {children}
    </>
  );
}
