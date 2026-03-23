import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  getAuthorApplicationStatus,
  isLegacyAuthorRole,
} from "@/lib/auth/author-approval";
import ReaderAppShell from "@/components/reader/ReaderAppShell";
import type { AuthorAccessMode } from "@/components/reader/ReaderAppShell";

export default async function ReaderLayout({
  children,
}: {
  children: ReactNode;
}) {
  let authorAccess: AuthorAccessMode = "apply";

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
    // If auth fails, default to "apply"
  }

  return <ReaderAppShell authorAccess={authorAccess}>{children}</ReaderAppShell>;
}
