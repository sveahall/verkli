import NavbarShell from "@/nav/NavbarShell";
import ReaderAppShell from "@/components/reader/ReaderAppShell";
import type { AuthorAccessMode } from "@/components/reader/ReaderAppShell";
import OfflineModeIndicator from "@/components/offline/OfflineModeIndicator";
import DemoCookieAutoAccept from "@/features/author-shell/DemoCookieAutoAccept";
import { createClient } from "@/lib/supabase/server";
import { isDemoModeActive } from "@/lib/flags";
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
  let demoModeActive = false;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, demo_mode")
        .eq("user_id", user.id)
        .maybeSingle();

      // Demo pitch: the reader finale is part of the golden path, and the
      // cookie banner overlapping it on stage looks broken. Mirror the
      // author shell's auto-accept (same flag + profile gating).
      demoModeActive = isDemoModeActive({
        demo_mode: (profile as { demo_mode?: boolean | null } | null)?.demo_mode,
      });

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
      <DemoCookieAutoAccept enabled={demoModeActive} />
      <ReaderAppShell authorAccess={authorAccess}>{children}</ReaderAppShell>
    </>
  );
}
