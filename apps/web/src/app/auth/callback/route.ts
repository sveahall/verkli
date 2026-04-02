import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { activeRoleCookieHeader } from "@/lib/active-role";
import type { ActiveRole } from "@/lib/active-role";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const { data: { user } } = await supabase.auth.getUser();
      let role: ActiveRole | null = null;
      const metaRole = user?.user_metadata?.active_role ?? user?.user_metadata?.role;
      if (metaRole === "author" || metaRole === "reader") {
        role = metaRole;
      }

      if (!role && user?.id) {
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

      const redirectPath = role === "author" ? "/author/home" : role === "reader" ? "/reader/home" : "/";
      const res = NextResponse.redirect(`${origin}${redirectPath}`);
      if (role) {
        res.headers.set("Set-Cookie", activeRoleCookieHeader(role));
      }
      return res;
    }
  }

  return NextResponse.redirect(`${origin}/?error=auth`);
}
