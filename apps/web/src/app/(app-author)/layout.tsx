import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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

  let role: "writer" | "reader" | null = null;

  if (user) {
    const metaRole = user.user_metadata?.role;
    if (metaRole === "writer" || metaRole === "reader") {
      role = metaRole;
    }

    if (!role) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profile?.role === "writer" || profile?.role === "reader") {
        role = profile.role;
      }
    }

    if (!role) {
      redirect("/writer/signin");
    }

    if (role === "reader") {
      redirect("/reader");
    }
  }

  const variant = user ? "APP_AUTHOR" : "PUBLIC_AUTHOR";

  return (
    <>
      <NavbarShell variant={variant} />
      {children}
    </>
  );
}
