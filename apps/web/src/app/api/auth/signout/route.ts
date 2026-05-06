import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Generic signout endpoint reachable from anywhere in the app. The reader
 * UI doesn't ship a visible logout button yet (the author shell does); in
 * the meantime, GET or POST /api/auth/signout clears the Supabase session
 * cookies and redirects back to the homepage. Used during demo prep when
 * switching between the demo author account and a real account.
 *
 * GET is allowed so a presenter can paste the URL into the address bar
 * during a pitch; POST is the proper form-post path.
 */
async function handle(request: Request): Promise<NextResponse> {
  const supabase = await createClient();
  await supabase.auth.signOut().catch(() => undefined);

  // Honor an explicit ?redirect=... if it points back at our own origin;
  // otherwise drop the user on the homepage.
  const url = new URL(request.url);
  const requested = url.searchParams.get("redirect");
  let target = "/";
  if (requested && requested.startsWith("/")) {
    target = requested;
  }
  return NextResponse.redirect(new URL(target, url.origin), { status: 303 });
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
