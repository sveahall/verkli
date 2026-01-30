import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser();
      let role: "writer" | "reader" | null = null;
      const metaRole = user?.user_metadata?.active_role ?? user?.user_metadata?.role;
      if (metaRole === "writer" || metaRole === "reader") {
        role = metaRole;
      }

      if (!role && user?.id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role, preferences")
          .eq("user_id", user.id)
          .maybeSingle();

        const preferenceRole = (profile?.preferences as { active_role?: string } | null)?.active_role;
        if (preferenceRole === "writer" || preferenceRole === "reader") {
          role = preferenceRole;
        } else if (profile?.role === "writer" || profile?.role === "reader") {
          role = profile.role;
        }
      }

      const redirectPath = role === "writer" ? "/writer/home" : role === "reader" ? "/reader/home" : "/";
      return NextResponse.redirect(`${origin}${redirectPath}`);
    }
  }

  // Return to home if something went wrong
  return NextResponse.redirect(`${origin}/?error=auth`);
}
