"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { resolveActiveRoleFromProfile } from "@/lib/active-role";

export default function PublicRoleCta({
  targetRole,
  href,
  label,
}: {
  targetRole: "author" | "reader";
  href: string;
  label: string;
}) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setShow(false);
        return;
      }

      const metadataRole = user.user_metadata?.active_role ?? user.user_metadata?.role;
      if (metadataRole === targetRole) {
        setShow(true);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role, preferences")
        .eq("user_id", user.id)
        .maybeSingle();

      setShow(resolveActiveRoleFromProfile(profile) === targetRole);
    };

    void load();
  }, [targetRole]);

  if (!show) return null;

  return (
    <div className="mx-auto w-full max-w-[100vw] px-4 md:px-6">
      <div className="mt-4 rounded-2xl border border-border bg-muted/30 px-4 py-3 text-[13px] text-muted-foreground">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span>You are already signed in.</span>
          <Link
            href={href}
            className="rounded-full border border-border bg-background px-4 py-2 text-[12px] font-semibold text-foreground transition hover:border-[#907AFF]/40 hover:text-[#907AFF]"
          >
            {label}
          </Link>
        </div>
      </div>
    </div>
  );
}
