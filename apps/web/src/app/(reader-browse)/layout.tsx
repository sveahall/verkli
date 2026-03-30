import NavbarShell from "@/nav/NavbarShell";
import ReaderAppShell from "@/components/reader/ReaderAppShell";
import type { AuthorAccessMode } from "@/components/reader/ReaderAppShell";
import OfflineModeIndicator from "@/components/offline/OfflineModeIndicator";
import { createClient } from "@/lib/supabase/server";
import {
  getAuthorApplicationStatus,
  isLegacyAuthorRole,
} from "@/lib/auth/author-approval";

/**
 * Reader browse layout - NO auth required.
 * For /reader/books/*, /reader/read/*, /reader/discover, /reader/authors/*
 * MVP: Anonymous readers can browse public content.
 * If the user happens to be logged in, show author-access controls.
 */
export default async function ReaderBrowseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let authorAccess: AuthorAccessMode = "hidden";

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

      const profileRole = String(profile?.role ?? "").trim().toLowerCase();

      if (profileRole === "admin" || isLegacyAuthorRole(profileRole)) {
        authorAccess = "switch";
      } else {
        const status = await getAuthorApplicationStatus(supabase, user.id);
        if (status === "approved") {
          authorAccess = "switch";
        } else if (status === "pending") {
          authorAccess = "pending";
        } else {
          authorAccess = "apply";
        }
      }
    }
  } catch {
    // Not logged in or auth error — keep "hidden"
  }

  return (
    <>
      <div className="lg:hidden">
        <NavbarShell variant="APP_READER" />
      </div>
      <OfflineModeIndicator />
      <ReaderAppShell authorAccess={authorAccess}>{children}</ReaderAppShell>
    </>
  );
}
