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
 * GET is permitted only for top-level browser navigation (Sec-Fetch-Dest:
 * document) so presenters can paste the URL into the address bar during a
 * pitch. Prefetch hints, <img> embeds, and cross-origin scripts cannot
 * trigger an unintended signout.
 */
async function handle(request: Request): Promise<NextResponse> {
  const supabase = await createClient();
  try {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.warn("[auth signout] Supabase signOut returned an error", {
        message: error.message,
      });
    }
  } catch (error) {
    console.warn("[auth signout] Supabase signOut failed", {
      message: error instanceof Error ? error.message : String(error),
    });
  }

  // Honor an explicit ?redirect=... if it points back at our own origin;
  // otherwise drop the user on the homepage.
  const url = new URL(request.url);
  const requested = url.searchParams.get("redirect");
  let target = "/";
  if (requested && (requested === "/" || /^\/[^/]/.test(requested))) {
    target = requested;
  }
  const response = NextResponse.redirect(new URL(target, url.origin), { status: 303 });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function GET(request: Request) {
  // Block prefetch/embed-based GETs that could log a user out involuntarily.
  // Browsers set Sec-Fetch-Dest=document for top-level navigation only.
  // Older clients that omit the header are allowed through for compatibility.
  const dest = request.headers.get("sec-fetch-dest");
  if (dest && dest !== "document") {
    return new NextResponse(null, { status: 405, headers: { "Cache-Control": "no-store" } });
  }
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
